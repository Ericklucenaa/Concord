// One-off migration of production data to the v1.1 data model.
//
//   node scripts/migrate-v1.1.mjs            # dry run (prints the plan)
//   node scripts/migrate-v1.1.mjs --apply    # writes the changes
//
// Requires `gcloud auth login` with an account that owns the Firebase project.
import { listCollection, setDocument, deleteDocument } from './firestore-admin.mjs';

const APPLY = process.argv.includes('--apply');
const plan = [];

function put(path, data, why) {
  plan.push({ op: 'set', path, data, why });
}
function del(path, why) {
  plan.push({ op: 'delete', path, why });
}

const [users, nicknames, servers, invites, userInvites, messages, dms, friends, voiceRooms, voiceSignals, screenSignals, soundboard] =
  await Promise.all([
    'concord_users', 'concord_nicknames', 'concord_servers', 'concord_invites', 'concord_user_invites',
    'concord_messages', 'concord_direct_messages', 'concord_friends', 'concord_voice_rooms',
    'concord_voice_signals', 'concord_screen_signals', 'concord_soundboard'
  ].map(listCollection));

const userById = new Map(users.map((u) => [u.id, u.data]));
const nickToUser = new Map(nicknames.map((n) => [n.id, n.data.userId]));
const lookupUserId = (name) => (name ? nickToUser.get(String(name).trim().toLowerCase().replace(/^@/, '')) : null);
const profileOf = (id) => ({ username: userById.get(id)?.username || 'Usuário', avatar: userById.get(id)?.avatar || '' });

// --- Users: drop the publicly readable email, add derived fields ---------------
for (const { id, data } of users) {
  const { email: _email, ...rest } = data;
  put(`concord_users/${id}`, {
    ...rest,
    id,
    usernameLower: (data.username || '').toLowerCase(),
    userTag: data.userTag || id.substring(0, 4).toUpperCase(),
    onboardingDone: true
  }, 'remove email, add usernameLower/userTag');
}

// --- Nicknames: keep every alias, add the login email (not listable) ----------
for (const { id, data } of nicknames) {
  const owner = userById.get(data.userId);
  if (!owner) {
    del(`concord_nicknames/${id}`, 'owner no longer exists');
    continue;
  }
  put(`concord_nicknames/${id}`, { ...data, email: owner.email || '' }, 'add login email');
}

// --- Servers: members[] -> memberIds + roles ----------------------------------
const serverById = new Map();
const channelToServer = new Map();
for (const { id, data } of servers) {
  const members = data.members || [];
  const memberIds = Array.from(new Set([data.ownerId, ...members.map((m) => m.id)].filter(Boolean)));
  const roles = {};
  memberIds.forEach((uid) => {
    const m = members.find((x) => x.id === uid);
    roles[uid] = uid === data.ownerId ? 'owner' : (['admin', 'moderator'].includes(m?.role) ? m.role : 'member');
  });
  const channels = (data.channels || []).map((c) => ({ id: c.id, name: c.name, type: c.type }));
  const ts = Number(String(id).match(/(\d{13})/)?.[1]);
  const migrated = {
    id,
    name: data.name,
    description: data.description || '',
    icon: data.icon || '',
    ownerId: data.ownerId,
    memberIds,
    roles,
    channels,
    mutedIds: [],
    bannedIds: [],
    channelRoles: {},
    readOnlyChannels: {},
    createdAt: data.createdAt || (ts ? new Date(ts).toISOString() : new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };
  serverById.set(id, migrated);
  channels.forEach((c) => channelToServer.set(c.id, id));
  put(`concord_servers/${id}`, migrated, `members -> memberIds/roles (${memberIds.length} members)`);
}

// --- Channel messages need serverId -------------------------------------------
for (const { id, data } of messages) {
  const serverId = channelToServer.get(data.channelId);
  if (!serverId) {
    del(`concord_messages/${id}`, 'channel belongs to a deleted server');
    continue;
  }
  put(`concord_messages/${id}`, { ...data, serverId, reactions: data.reactions || {}, pinned: false }, 'add serverId');
}

// --- Invites: keep only those for existing servers, add creatorId -------------
for (const { id, data } of invites) {
  const server = serverById.get(data.serverId);
  if (!server) {
    del(`concord_invites/${id}`, 'server was deleted');
    continue;
  }
  const creator = lookupUserId(data.senderUsername);
  put(`concord_invites/${id}`, {
    code: id,
    serverId: data.serverId,
    serverName: server.name,
    serverIcon: server.icon,
    serverDescription: server.description,
    channelId: data.channelId || null,
    creatorId: creator && server.memberIds.includes(creator) ? creator : server.ownerId,
    creatorUsername: data.senderUsername || '',
    createdAt: data.createdAt || new Date().toISOString()
  }, 'new invite shape');
}

// Inbox invites used usernames as keys; all existing ones are already answered.
for (const { id } of userInvites) del(`concord_user_invites/${id}`, 'old inbox format');

// --- DMs: create threads with explicit participants ----------------------------
const threads = new Map();
for (const { data } of dms) {
  const dmId = data.dmId;
  const parts = dmId.replace(/^dm_/, '').split('_');
  if (parts.length !== 2) continue;
  const participants = [...parts].sort();
  const t = threads.get(dmId) || { participants, last: null };
  if (!t.last || data.createdAt > t.last.createdAt) t.last = data;
  threads.set(dmId, t);
}
for (const [dmId, t] of threads) {
  const canonical = `dm_${t.participants[0]}_${t.participants[1]}`;
  if (canonical !== dmId) {
    console.warn(`skipping thread with non-canonical id ${dmId}`);
    continue;
  }
  put(`concord_dm_threads/${dmId}`, {
    id: dmId,
    isGroup: false,
    participants: t.participants,
    profiles: Object.fromEntries(t.participants.map((p) => [p, profileOf(p)])),
    lastMessageAt: t.last.createdAt,
    lastMessageBy: t.last.senderId,
    lastPreview: `${t.last.senderUsername}: ${t.last.content || '📷 Imagem'}`.slice(0, 140),
    createdAt: t.last.createdAt,
    updatedAt: new Date().toISOString()
  }, 'create DM thread');
}

// --- Friends: nickname-keyed docs -> pair ids -----------------------------------
for (const { id, data } of friends) {
  del(`concord_friends/${id}`, 'old id format');
  if (!data.senderId || !data.receiverId) continue;
  const participants = [data.senderId, data.receiverId].sort();
  put(`concord_friends/${participants.join('_')}`, {
    id: participants.join('_'),
    participants,
    requesterId: data.senderId,
    status: data.status === 'accepted' ? 'accepted' : 'pending',
    profiles: Object.fromEntries(participants.map((p) => [p, profileOf(p)])),
    createdAt: data.updatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, 'friendship by pair id');
}

// --- Ephemeral data from the old voice implementation ---------------------------
for (const { id } of voiceRooms) del(`concord_voice_rooms/${id}`, 'replaced by concord_voice_presence');
for (const { id } of voiceSignals) del(`concord_voice_signals/${id}`, 'stale signal');
for (const { id } of screenSignals) del(`concord_screen_signals/${id}`, 'stale signal');
for (const { id } of soundboard) del(`concord_soundboard/${id}`, 'stale sound event');

// --- Report / apply --------------------------------------------------------------
const summary = {};
plan.forEach((p) => {
  const key = `${p.op} ${p.path.split('/')[0]}`;
  summary[key] = (summary[key] || 0) + 1;
});
console.table(summary);
plan.filter((p) => !p.path.includes('_signals/')).forEach((p) => console.log(`${p.op.padEnd(6)} ${p.path}  — ${p.why}`));

if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to write these changes.');
  process.exit(0);
}

let done = 0;
for (const p of plan) {
  if (p.op === 'set') await setDocument(p.path, p.data);
  else await deleteDocument(p.path);
  done++;
  if (done % 100 === 0) console.log(`${done}/${plan.length}`);
}
console.log(`Migration applied: ${done} operations.`);
