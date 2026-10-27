// Security rules tests. Run with: npm run test:emulators
import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  arrayUnion,
  arrayRemove,
  deleteField,
  writeBatch,
  increment
} from 'firebase/firestore';

const PROJECT_ID = 'demo-concord-rules';
let env;

const OWNER = 'owneruid';
const ADMIN = 'adminuid';
const MOD = 'moduid';
const MEMBER = 'memberuid';
const STRANGER = 'strangeruid';

const SERVER = {
  id: 'srv1',
  name: 'Teste',
  ownerId: OWNER,
  memberIds: [OWNER, ADMIN, MOD, MEMBER],
  roles: { [OWNER]: 'owner', [ADMIN]: 'admin', [MOD]: 'moderator', [MEMBER]: 'member' },
  channels: [
    { id: 'general', name: 'geral', type: 'text' },
    { id: 'staff', name: 'staff', type: 'text' },
    { id: 'news', name: 'avisos', type: 'text' }
  ],
  channelRoles: { staff: ['moderator'] },
  readOnlyChannels: { news: true },
  mutedIds: [],
  bannedIds: []
};

const db = (uid) => env.authenticatedContext(uid).firestore();

// Joining = server update + invite counter in one batch, like the app does.
function join(uid, code, role = 'member') {
  const f = db(uid);
  const batch = writeBatch(f);
  batch.update(doc(f, 'concord_servers', 'srv1'), {
    memberIds: arrayUnion(uid), [`roles.${uid}`]: role, lastJoinCode: code
  });
  batch.update(doc(f, 'concord_invites', code), { uses: increment(1) });
  return batch.commit();
}
const anon = () => env.unauthenticatedContext().firestore();

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

function message(id, overrides = {}) {
  return {
    id,
    serverId: 'srv1',
    channelId: 'general',
    userId: MEMBER,
    username: 'member',
    content: 'oi',
    reactions: {},
    pinned: false,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host,
      port: Number(port)
    }
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (f) => {
    await setDoc(doc(f, 'concord_servers', 'srv1'), SERVER);
    await setDoc(doc(f, 'concord_invites', 'GOODCODE'), { code: 'GOODCODE', serverId: 'srv1', creatorId: OWNER });
    await setDoc(doc(f, 'concord_invites', 'OTHERSRV'), { code: 'OTHERSRV', serverId: 'srv2', creatorId: STRANGER });
    await setDoc(doc(f, 'concord_messages', 'm1'), message('m1'));
    await setDoc(doc(f, 'concord_messages', 'm-staff'), message('m-staff', { channelId: 'staff', userId: MOD }));
  });
});

describe('unauthenticated access', () => {
  it('cannot read servers, messages or users', async () => {
    await assertFails(getDoc(doc(anon(), 'concord_servers', 'srv1')));
    await assertFails(getDoc(doc(anon(), 'concord_messages', 'm1')));
    await assertFails(getDocs(collection(anon(), 'concord_users')));
  });

  it('can read the update manifest but never write it', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'concord_app_version', 'latest')));
    await assertFails(setDoc(doc(db(OWNER), 'concord_app_version', 'latest'), { downloadUrl: 'https://evil.example' }));
  });

  it('denies unknown collections', async () => {
    await assertFails(setDoc(doc(db(MEMBER), 'anything', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(db(MEMBER), 'concord_voice_rooms', 'x')));
  });
});

describe('servers', () => {
  it('members can read, strangers cannot', async () => {
    await assertSucceeds(getDoc(doc(db(MEMBER), 'concord_servers', 'srv1')));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_servers', 'srv1')));
  });

  it('lists only servers the user belongs to', async () => {
    await assertSucceeds(getDocs(query(collection(db(MEMBER), 'concord_servers'), where('memberIds', 'array-contains', MEMBER))));
    await assertFails(getDocs(collection(db(MEMBER), 'concord_servers')));
  });

  it('creating a server requires being its sole owner', async () => {
    const ok = { id: 's', name: 'x', ownerId: STRANGER, memberIds: [STRANGER], roles: { [STRANGER]: 'owner' }, channels: [] };
    await assertSucceeds(setDoc(doc(db(STRANGER), 'concord_servers', 's'), ok));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_servers', 's2'), { ...ok, memberIds: [STRANGER, MEMBER], roles: { [STRANGER]: 'owner', [MEMBER]: 'owner' } }));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_servers', 's3'), { ...ok, ownerId: OWNER }));
  });

  it('joining requires a valid invite for this server', async () => {
    await assertFails(join(STRANGER, 'NOPE'));
    await assertFails(join(STRANGER, 'OTHERSRV'));
    await assertFails(updateDoc(doc(db(STRANGER), 'concord_servers', 'srv1'), {
      memberIds: arrayUnion(STRANGER), [`roles.${STRANGER}`]: 'member', lastJoinCode: 'GOODCODE'
    }));
    await assertSucceeds(join(STRANGER, 'GOODCODE'));
  });

  it('cannot join as admin or while banned', async () => {
    await assertFails(join(STRANGER, 'GOODCODE', 'admin'));
    await seed((f) => updateDoc(doc(f, 'concord_servers', 'srv1'), { bannedIds: [STRANGER] }));
    await assertFails(join(STRANGER, 'GOODCODE'));
  });

  it('expired or used-up invites are rejected', async () => {
    await seed(async (f) => {
      await setDoc(doc(f, 'concord_invites', 'OLD'), { code: 'OLD', serverId: 'srv1', creatorId: OWNER, expiresAt: Date.now() - 1000, uses: 0 });
      await setDoc(doc(f, 'concord_invites', 'ONCE'), { code: 'ONCE', serverId: 'srv1', creatorId: OWNER, maxUses: 1, uses: 1 });
      await setDoc(doc(f, 'concord_invites', 'TWICE'), { code: 'TWICE', serverId: 'srv1', creatorId: OWNER, maxUses: 2, uses: 1 });
    });
    await assertFails(join(STRANGER, 'OLD'));
    await assertFails(join(STRANGER, 'ONCE'));
    await assertSucceeds(join(STRANGER, 'TWICE'));
  });

  it('invite counters cannot be bumped without joining', async () => {
    await assertFails(updateDoc(doc(db(STRANGER), 'concord_invites', 'GOODCODE'), { uses: increment(1) }));
  });

  it('members can leave; the owner must transfer first', async () => {
    const leave = (uid) => updateDoc(doc(db(uid), 'concord_servers', 'srv1'), {
      memberIds: arrayRemove(uid),
      [`roles.${uid}`]: deleteField()
    });
    await assertSucceeds(leave(MEMBER));
    await assertFails(leave(OWNER));
  });

  it('members cannot rename the server or promote themselves', async () => {
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_servers', 'srv1'), { name: 'hack' }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_servers', 'srv1'), { [`roles.${MEMBER}`]: 'admin' }));
  });

  it('admins can kick but not take ownership', async () => {
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'concord_servers', 'srv1'), {
      memberIds: arrayRemove(MEMBER),
      [`roles.${MEMBER}`]: deleteField()
    }));
    await assertFails(updateDoc(doc(db(ADMIN), 'concord_servers', 'srv1'), { ownerId: ADMIN }));
    await assertFails(updateDoc(doc(db(ADMIN), 'concord_servers', 'srv1'), {
      memberIds: arrayRemove(OWNER),
      [`roles.${OWNER}`]: deleteField()
    }));
  });

  it('moderators can only change the voice-mute list', async () => {
    await assertSucceeds(updateDoc(doc(db(MOD), 'concord_servers', 'srv1'), { mutedIds: arrayUnion(MEMBER) }));
    await assertFails(updateDoc(doc(db(MOD), 'concord_servers', 'srv1'), {
      memberIds: arrayRemove(MEMBER),
      [`roles.${MEMBER}`]: deleteField()
    }));
  });

  it('owner can transfer ownership and delete the server', async () => {
    await assertSucceeds(updateDoc(doc(db(OWNER), 'concord_servers', 'srv1'), {
      ownerId: ADMIN,
      [`roles.${ADMIN}`]: 'owner',
      [`roles.${OWNER}`]: 'admin'
    }));
    await assertFails(deleteDoc(doc(db(OWNER), 'concord_servers', 'srv1')));
    await assertSucceeds(deleteDoc(doc(db(ADMIN), 'concord_servers', 'srv1')));
  });
});

describe('channel messages', () => {
  it('only members who can see the channel can read', async () => {
    await assertSucceeds(getDoc(doc(db(MEMBER), 'concord_messages', 'm1')));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_messages', 'm1')));
    await assertFails(getDoc(doc(db(MEMBER), 'concord_messages', 'm-staff')));
    await assertSucceeds(getDoc(doc(db(MOD), 'concord_messages', 'm-staff')));
    await assertSucceeds(getDoc(doc(db(ADMIN), 'concord_messages', 'm-staff')));
  });

  it('channel queries must be scoped to the server', async () => {
    const scoped = query(collection(db(MEMBER), 'concord_messages'), where('serverId', '==', 'srv1'), where('channelId', '==', 'general'));
    await assertSucceeds(getDocs(scoped));
    await assertFails(getDocs(query(collection(db(MEMBER), 'concord_messages'), where('channelId', '==', 'general'))));
  });

  it('cannot post as someone else or into read-only channels', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_messages', 'm2'), message('m2')));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_messages', 'm3'), message('m3', { userId: OWNER })));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_messages', 'm4'), message('m4', { channelId: 'news' })));
    await assertSucceeds(setDoc(doc(db(MOD), 'concord_messages', 'm5'), message('m5', { channelId: 'news', userId: MOD })));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_messages', 'm6'), message('m6', { userId: STRANGER })));
  });

  it('only the author edits; members react; moderators pin', async () => {
    await assertSucceeds(updateDoc(doc(db(MEMBER), 'concord_messages', 'm1'), { content: 'editado', editedAt: 'now' }));
    await assertFails(updateDoc(doc(db(ADMIN), 'concord_messages', 'm1'), { content: 'hack' }));
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'concord_messages', 'm1'), { 'reactions.👍': arrayUnion(ADMIN), lastReaction: { emoji: '👍', uid: ADMIN } }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_messages', 'm1'), { pinned: true }));
    await assertSucceeds(updateDoc(doc(db(MOD), 'concord_messages', 'm1'), { pinned: true, pinnedBy: MOD }));
  });

  it('reactions only change the caller own entry', async () => {
    await seed((f) => updateDoc(doc(f, 'concord_messages', 'm1'), { reactions: { '🔥': [OWNER, ADMIN] } }));
    const react = (uid, data) => updateDoc(doc(db(uid), 'concord_messages', 'm1'), data);
    await assertFails(react(MEMBER, { 'reactions.🔥': arrayRemove(OWNER), lastReaction: { emoji: '🔥', uid: MEMBER } }));
    await assertFails(react(MEMBER, { 'reactions.🔥': arrayUnion(MEMBER), lastReaction: { emoji: '🔥', uid: OWNER } }));
    await assertFails(react(MEMBER, { 'reactions.🔥': [MEMBER], lastReaction: { emoji: '🔥', uid: MEMBER } }));
    await assertFails(react(MEMBER, { reactions: {}, lastReaction: { emoji: '🔥', uid: MEMBER } }));
    await assertSucceeds(react(MEMBER, { 'reactions.🔥': arrayUnion(MEMBER), lastReaction: { emoji: '🔥', uid: MEMBER } }));
    await assertSucceeds(react(OWNER, { 'reactions.🔥': arrayRemove(OWNER), lastReaction: { emoji: '🔥', uid: OWNER } }));
  });

  it('poll votes only change the caller own vote', async () => {
    await seed((f) => setDoc(doc(f, 'concord_messages', 'poll1'), message('poll1', { poll: { question: 'q', options: [{ id: 'a' }, { id: 'b' }] }, pollVotes: { [OWNER]: ['a'] } })));
    await assertSucceeds(updateDoc(doc(db(MEMBER), 'concord_messages', 'poll1'), { [`pollVotes.${MEMBER}`]: ['b'] }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_messages', 'poll1'), { [`pollVotes.${OWNER}`]: ['b'] }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_messages', 'm1'), { [`pollVotes.${MEMBER}`]: ['b'] }));
  });

  it('typing indicators are only visible inside the scope', async () => {
    const t = { scopeKey: 'general', scopeType: 'server', scopeId: 'srv1', userId: MEMBER, username: 'm', expiresAt: 1 };
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_typing', `general_${MEMBER}`), t));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_typing', `general_${STRANGER}`), { ...t, userId: STRANGER }));
    const q = (uid) => getDocs(query(collection(db(uid), 'concord_typing'), where('scopeKey', '==', 'general'), where('scopeType', '==', 'server'), where('scopeId', '==', 'srv1')));
    await assertSucceeds(q(OWNER));
    await assertFails(q(STRANGER));
  });

  it('mentions from someone the target blocked are rejected', async () => {
    const m = { targetId: OWNER, authorId: MEMBER, serverId: 'srv1', channelId: 'general', messageId: 'm1', read: false };
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_mentions', 'b1'), m));
    await seed((f) => setDoc(doc(f, 'concord_blocks', OWNER), { blockedIds: [MEMBER] }));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_mentions', 'b2'), m));
    await assertSucceeds(updateDoc(doc(db(OWNER), 'concord_mentions', 'b1'), { read: true }));
    await assertFails(updateDoc(doc(db(OWNER), 'concord_mentions', 'b1'), { targetId: MEMBER }));
  });

  it('author or moderators delete', async () => {
    await seed((f) => setDoc(doc(f, 'concord_messages', 'm-owner'), message('m-owner', { userId: OWNER })));
    await assertFails(deleteDoc(doc(db(MEMBER), 'concord_messages', 'm-owner')));
    await assertSucceeds(deleteDoc(doc(db(MEMBER), 'concord_messages', 'm1')));
    await assertSucceeds(deleteDoc(doc(db(MOD), 'concord_messages', 'm-owner')));
  });
});

describe('direct messages', () => {
  const pair = [MEMBER, OWNER].sort();
  const THREAD = `dm_${pair[0]}_${pair[1]}`;

  beforeEach(async () => {
    await seed(async (f) => {
      await setDoc(doc(f, 'concord_dm_threads', THREAD), { id: THREAD, isGroup: false, participants: pair });
      await setDoc(doc(f, 'concord_direct_messages', 'd1'), { id: 'd1', dmId: THREAD, senderId: MEMBER, content: 'oi', createdAt: 'x' });
    });
  });

  it('only participants read', async () => {
    await assertSucceeds(getDoc(doc(db(OWNER), 'concord_direct_messages', 'd1')));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_direct_messages', 'd1')));
    await assertFails(getDocs(query(collection(db(STRANGER), 'concord_dm_threads'), where('participants', 'array-contains', MEMBER))));
  });

  it('thread ids must match their participants', async () => {
    const p = [STRANGER, ADMIN].sort();
    await assertSucceeds(setDoc(doc(db(STRANGER), 'concord_dm_threads', `dm_${p[0]}_${p[1]}`), { isGroup: false, participants: p }));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_dm_threads', 'dm_fake'), { isGroup: false, participants: p }));
  });

  it('blocked users cannot send', async () => {
    const send = (id) => setDoc(doc(db(MEMBER), 'concord_direct_messages', id), { id, dmId: THREAD, senderId: MEMBER, content: 'oi' });
    await assertSucceeds(send('d2'));
    await seed((f) => setDoc(doc(f, 'concord_blocks', OWNER), { blockedIds: [MEMBER] }));
    await assertFails(send('d3'));
  });

  it('cannot send as someone else', async () => {
    await assertFails(setDoc(doc(db(MEMBER), 'concord_direct_messages', 'd4'), { id: 'd4', dmId: THREAD, senderId: OWNER, content: 'x' }));
  });

  it('respects "friends only" DM settings', async () => {
    const send = (id) => setDoc(doc(db(MEMBER), 'concord_direct_messages', id), { id, dmId: THREAD, senderId: MEMBER, content: 'oi' });
    await seed((f) => setDoc(doc(f, 'concord_users', OWNER), { id: OWNER, username: 'o', dmPolicy: 'friends' }));
    await assertFails(send('d5'));
    await seed((f) => setDoc(doc(f, 'concord_friends', pair.join('_')), { participants: pair, requesterId: MEMBER, status: 'accepted' }));
    await assertSucceeds(send('d6'));
  });

  it('groups start with a friend and only friends can be added', async () => {
    const friendPair = [MEMBER, ADMIN].sort();
    await seed((f) => setDoc(doc(f, 'concord_friends', friendPair.join('_')), { participants: friendPair, requesterId: MEMBER, status: 'accepted' }));
    const group = { isGroup: true, ownerId: MEMBER, name: 'g', participants: [MEMBER, ADMIN] };
    await assertFails(setDoc(doc(db(MEMBER), 'concord_dm_threads', 'grp_a'), { ...group, participants: [MEMBER, STRANGER] }));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_dm_threads', 'grp_b'), { ...group, participants: [MEMBER, ADMIN, STRANGER] }));
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_dm_threads', 'grp_ok'), group));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_dm_threads', 'grp_ok'), { participants: arrayUnion(STRANGER), lastAddedId: STRANGER }));
    const ownerPair = [MEMBER, OWNER].sort();
    await seed((f) => setDoc(doc(f, 'concord_friends', ownerPair.join('_')), { participants: ownerPair, requesterId: MEMBER, status: 'accepted' }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_dm_threads', 'grp_ok'), { participants: arrayUnion(OWNER), lastAddedId: ADMIN }));
    await assertSucceeds(updateDoc(doc(db(MEMBER), 'concord_dm_threads', 'grp_ok'), { participants: arrayUnion(OWNER), lastAddedId: OWNER }));
  });
});

describe('friends, nicknames and blocks', () => {
  const pair = [MEMBER, STRANGER].sort();
  const pairId = pair.join('_');

  it('requester cannot accept their own request', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_friends', pairId), { participants: pair, requesterId: MEMBER, status: 'pending' }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_friends', pairId), { status: 'accepted' }));
    await assertSucceeds(updateDoc(doc(db(STRANGER), 'concord_friends', pairId), { status: 'accepted' }));
  });

  it('cannot create an already accepted friendship', async () => {
    await assertFails(setDoc(doc(db(MEMBER), 'concord_friends', pairId), { participants: pair, requesterId: MEMBER, status: 'accepted' }));
  });

  it('nicknames cannot be taken over', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_nicknames', 'joao'), { userId: MEMBER, username: 'joao' }));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_nicknames', 'joao'), { userId: STRANGER, username: 'joao' }));
    await assertFails(deleteDoc(doc(db(STRANGER), 'concord_nicknames', 'joao')));
    await assertSucceeds(getDoc(doc(anon(), 'concord_nicknames', 'joao')));
    await assertFails(getDocs(collection(anon(), 'concord_nicknames')));
  });

  it('block lists and read states are private', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_blocks', MEMBER), { blockedIds: [STRANGER] }));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_blocks', MEMBER)));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_read_states', MEMBER), { channels: {} }));
  });

  it('users only write their own profile', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_users', MEMBER), { id: MEMBER, username: 'm' }));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_users', OWNER), { id: OWNER, username: 'hack' }));
  });
});

describe('voice presence and signaling', () => {
  it('users write only their own presence; moderators can disconnect others', async () => {
    const presence = (uid) => ({ userId: uid, serverId: 'srv1', channelId: 'v1', lastSeen: 1 });
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_voice_presence', MEMBER), presence(MEMBER)));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_voice_presence', ADMIN), presence(ADMIN)));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_voice_presence', STRANGER), presence(STRANGER)));
    await assertFails(deleteDoc(doc(db(STRANGER), 'concord_voice_presence', MEMBER)));
    await seed((f) => setDoc(doc(f, 'concord_voice_presence', OWNER), presence(OWNER)));
    await assertFails(deleteDoc(doc(db(MEMBER), 'concord_voice_presence', OWNER)));
    await assertSucceeds(deleteDoc(doc(db(MOD), 'concord_voice_presence', MEMBER)));
  });

  it('signals are only allowed inside the same call and readable by their target', async () => {
    await assertFails(setDoc(doc(db(MEMBER), 'concord_voice_signals', 's0'), { senderId: MEMBER, targetId: OWNER, channelId: 'v1' }));
    await seed(async (f) => {
      await setDoc(doc(f, 'concord_voice_presence', MEMBER), { userId: MEMBER, serverId: 'srv1', channelId: 'v1' });
      await setDoc(doc(f, 'concord_voice_presence', OWNER), { userId: OWNER, serverId: 'srv1', channelId: 'v1' });
      await setDoc(doc(f, 'concord_voice_presence', ADMIN), { userId: ADMIN, serverId: 'srv1', channelId: 'v2' });
    });
    await assertFails(setDoc(doc(db(MEMBER), 'concord_voice_signals', 's9'), { senderId: MEMBER, targetId: ADMIN, channelId: 'v1' }));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_screen_signals', 'x9'), { fromUserId: MEMBER, toUserId: ADMIN, channelId: 'v1' }));
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_screen_signals', 'x1'), { fromUserId: MEMBER, toUserId: OWNER, channelId: 'v1' }));
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_voice_signals', 's1'), { senderId: MEMBER, targetId: OWNER, channelId: 'v1' }));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_voice_signals', 's2'), { senderId: OWNER, targetId: MEMBER, channelId: 'v1' }));
    await assertSucceeds(getDoc(doc(db(OWNER), 'concord_voice_signals', 's1')));
    await assertFails(getDoc(doc(db(ADMIN), 'concord_voice_signals', 's1')));
  });
});

describe('attachments and audit log', () => {
  it('attachments follow scope membership', async () => {
    const meta = { id: 'a1', ownerId: MEMBER, scopeType: 'server', scopeId: 'srv1', name: 'f.txt', size: 10, chunkCount: 1 };
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_attachments', 'a1'), meta));
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_attachments', 'a1', 'chunks', '000'), { index: 0, data: 'aGk=' }));
    await assertSucceeds(getDoc(doc(db(OWNER), 'concord_attachments', 'a1', 'chunks', '000')));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_attachments', 'a1')));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_attachments', 'a2'), { ...meta, id: 'a2', size: 20 * 1024 * 1024 }));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_attachments', 'a3'), { ...meta, id: 'a3', ownerId: STRANGER }));
  });

  it('audit log is written and read by moderators only', async () => {
    const entry = (uid) => ({ serverId: 'srv1', actorId: uid, action: 'kick', createdAt: 'x' });
    await assertSucceeds(setDoc(doc(db(MOD), 'concord_audit', 'e1'), entry(MOD)));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_audit', 'e2'), entry(MEMBER)));
    await assertFails(getDoc(doc(db(MEMBER), 'concord_audit', 'e1')));
    await assertSucceeds(getDoc(doc(db(ADMIN), 'concord_audit', 'e1')));
    await assertFails(updateDoc(doc(db(ADMIN), 'concord_audit', 'e1'), { action: 'x' }));
  });

  it('mentions can only target members and are read by the target', async () => {
    const m = (target) => ({ targetId: target, authorId: MEMBER, serverId: 'srv1', channelId: 'general', messageId: 'm1' });
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_mentions', 'x1'), m(OWNER)));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_mentions', 'x2'), m(STRANGER)));
    await assertSucceeds(getDoc(doc(db(OWNER), 'concord_mentions', 'x1')));
    await assertFails(getDoc(doc(db(ADMIN), 'concord_mentions', 'x1')));
  });
});

describe('events, DM calls and account data', () => {
  it('members RSVP for themselves only', async () => {
    await seed((f) => setDoc(doc(f, 'concord_events', 'e1'), { id: 'e1', serverId: 'srv1', createdBy: OWNER, title: 't', startsAt: 1, rsvps: {} }));
    await assertSucceeds(updateDoc(doc(db(MEMBER), 'concord_events', 'e1'), { [`rsvps.${MEMBER}`]: 'going' }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_events', 'e1'), { [`rsvps.${ADMIN}`]: 'going' }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_events', 'e1'), { title: 'hack' }));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_events', 'e1')));
  });

  it('DM calls are limited to the conversation participants', async () => {
    const pair = [MEMBER, OWNER].sort();
    const thread = `dm_${pair[0]}_${pair[1]}`;
    await seed((f) => setDoc(doc(f, 'concord_dm_threads', thread), { id: thread, isGroup: false, participants: pair }));
    const call = (uid) => ({ userId: uid, serverId: null, threadId: thread, channelId: thread });
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_voice_presence', MEMBER), call(MEMBER)));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_voice_presence', STRANGER), call(STRANGER)));
    await assertSucceeds(getDocs(query(collection(db(OWNER), 'concord_voice_presence'), where('threadId', '==', thread))));
    await assertFails(getDocs(query(collection(db(STRANGER), 'concord_voice_presence'), where('threadId', '==', thread))));
  });

  it('users can delete their own profile and send error reports', async () => {
    await seed((f) => setDoc(doc(f, 'concord_users', MEMBER), { id: MEMBER, username: 'm' }));
    await assertFails(deleteDoc(doc(db(OWNER), 'concord_users', MEMBER)));
    await assertSucceeds(deleteDoc(doc(db(MEMBER), 'concord_users', MEMBER)));
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_error_reports', 'r1'), { userId: MEMBER, message: 'boom' }));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_error_reports', 'r2'), { userId: OWNER, message: 'boom' }));
    await assertFails(getDoc(doc(db(MEMBER), 'concord_error_reports', 'r1')));
  });
});
