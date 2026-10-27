import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  arrayUnion,
  arrayRemove,
  deleteField
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn } from '../log';
import { roleOf } from '../permissions';
import { newId, nowIso } from './util';

const SERVERS = 'concord_servers';
const INVITES = 'concord_invites';
const USER_INVITES = 'concord_user_invites';
const AUDIT = 'concord_audit';

export const DEFAULT_SERVER_ICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'><defs><linearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'><stop offset='0%25' stop-color='%236366f1'/><stop offset='100%25' stop-color='%233b82f6'/></linearGradient></defs><rect width='100' height='100' rx='26' fill='url(%23g)'/><circle cx='50' cy='50' r='12' fill='%23ffffff'/><path d='M 30 50 A 20 20 0 0 1 70 50' fill='none' stroke='%23ffffff' stroke-width='5' stroke-linecap='round'/><path d='M 20 50 A 30 30 0 0 1 80 50' fill='none' stroke='%23ffffff' stroke-width='5' stroke-linecap='round' opacity='0.6'/></svg>";

export function normalizeServer(raw, userId) {
  if (!raw) return null;
  return {
    ...raw,
    channels: Array.isArray(raw.channels) ? raw.channels : [],
    memberIds: Array.isArray(raw.memberIds) ? raw.memberIds : [],
    roles: raw.roles || {},
    mutedIds: raw.mutedIds || [],
    bannedIds: raw.bannedIds || [],
    channelRoles: raw.channelRoles || {},
    readOnlyChannels: raw.readOnlyChannels || {},
    role: roleOf(raw, userId)
  };
}

function makeChannel(name, type) {
  return { id: newId('ch'), name, type };
}

export function textChannelName(raw) {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-_à-ú]/gi, '').slice(0, 50);
}

/**
 * Live list of my servers. A server that exists only as a local pending write
 * (just created/joined) is held back until the backend confirms it: listeners
 * that depend on it (messages, voice, unread) are checked by the security
 * rules against the server document, and would be denied before it exists.
 */
export function listenToMyServers(userId, callback, onError) {
  const q = query(collection(firestore, SERVERS), where('memberIds', 'array-contains', String(userId)));
  const confirmed = new Map();
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const ids = new Set();
      snap.docs.forEach((d) => {
        ids.add(d.id);
        if (!d.metadata.hasPendingWrites || confirmed.has(d.id)) confirmed.set(d.id, normalizeServer(d.data(), userId));
      });
      Array.from(confirmed.keys()).forEach((id) => !ids.has(id) && confirmed.delete(id));
      callback(Array.from(confirmed.values()));
    },
    (err) => {
      logWarn('listen servers', err);
      onError?.(err);
    }
  );
}

export async function createServer(user, { name, description = '', icon = '', channels = null }) {
  const id = newId('srv');
  const server = {
    id,
    name: name.trim().slice(0, 100),
    description: description.trim().slice(0, 500),
    icon: icon || DEFAULT_SERVER_ICON,
    ownerId: user.id,
    memberIds: [user.id],
    roles: { [user.id]: 'owner' },
    channels: channels || [makeChannel('geral', 'text'), makeChannel('Sala Geral', 'voice')],
    mutedIds: [],
    bannedIds: [],
    channelRoles: {},
    readOnlyChannels: {},
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await setDoc(doc(firestore, SERVERS, id), server);
  return normalizeServer(server, user.id);
}

export function starterChannels() {
  return [
    makeChannel('geral', 'text'),
    makeChannel('avisos', 'text'),
    makeChannel('Sala de Voz 1', 'voice'),
    makeChannel('Transmissão & Jogos', 'voice')
  ];
}

export async function updateServerFields(serverId, fields) {
  await updateDoc(doc(firestore, SERVERS, serverId), { ...fields, updatedAt: nowIso() });
}

/** Read-modify-write of the channel list, with per-channel permission maps. */
async function mutateChannels(serverId, mutate) {
  const ref = doc(firestore, SERVERS, serverId);
  return runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Servidor não encontrado.');
    const data = snap.data();
    const next = mutate({
      channels: [...(data.channels || [])],
      channelRoles: { ...(data.channelRoles || {}) },
      readOnlyChannels: { ...(data.readOnlyChannels || {}) }
    });
    tx.update(ref, { ...next, updatedAt: nowIso() });
    return next;
  });
}

function applyChannelPermissions(state, channelId, { readOnly, allowedRoles }) {
  if (readOnly !== undefined) {
    if (readOnly) state.readOnlyChannels[channelId] = true;
    else delete state.readOnlyChannels[channelId];
  }
  if (allowedRoles !== undefined) {
    if (allowedRoles && allowedRoles.length > 0) state.channelRoles[channelId] = allowedRoles;
    else delete state.channelRoles[channelId];
  }
}

export async function addChannel(serverId, { name, type = 'text', readOnly = false, allowedRoles = null }) {
  const cleanName = type === 'text' ? textChannelName(name) : String(name).trim().slice(0, 50);
  if (!cleanName) throw new Error('Informe um nome válido para o canal.');
  const channel = makeChannel(cleanName, type);
  await mutateChannels(serverId, (state) => {
    state.channels.push(channel);
    applyChannelPermissions(state, channel.id, { readOnly, allowedRoles });
    return state;
  });
  return channel;
}

export async function updateChannel(serverId, channelId, { name, readOnly, allowedRoles }) {
  await mutateChannels(serverId, (state) => {
    state.channels = state.channels.map((c) => {
      if (c.id !== channelId || name === undefined) return c;
      return { ...c, name: c.type === 'text' ? textChannelName(name) : String(name).trim().slice(0, 50) };
    });
    applyChannelPermissions(state, channelId, { readOnly, allowedRoles });
    return state;
  });
}

export async function deleteChannel(serverId, channelId) {
  await mutateChannels(serverId, (state) => {
    state.channels = state.channels.filter((c) => c.id !== channelId);
    delete state.channelRoles[channelId];
    delete state.readOnlyChannels[channelId];
    return state;
  });
}

export async function deleteServer(serverId) {
  await deleteDoc(doc(firestore, SERVERS, serverId));
}

/**
 * Leaves a server. An owner hands the server to the highest-ranked remaining
 * member first; the last member deletes it.
 */
export async function leaveServer(server, userId) {
  const ref = doc(firestore, SERVERS, server.id);
  const others = (server.memberIds || []).filter((id) => id !== userId);

  if (others.length === 0) {
    await deleteDoc(ref);
    return;
  }

  if (server.ownerId === userId) {
    const rank = { admin: 0, moderator: 1, member: 2 };
    const heir = [...others].sort((a, b) => (rank[server.roles?.[a]] ?? 3) - (rank[server.roles?.[b]] ?? 3))[0];
    await transferOwnership(server.id, userId, heir);
  }

  await updateDoc(ref, {
    memberIds: arrayRemove(userId),
    [`roles.${userId}`]: deleteField(),
    updatedAt: nowIso()
  });
}

export async function transferOwnership(serverId, currentOwnerId, newOwnerId) {
  await updateDoc(doc(firestore, SERVERS, serverId), {
    ownerId: newOwnerId,
    [`roles.${newOwnerId}`]: 'owner',
    [`roles.${currentOwnerId}`]: 'admin',
    updatedAt: nowIso()
  });
}

export async function setMemberRole(serverId, targetId, role) {
  await updateDoc(doc(firestore, SERVERS, serverId), { [`roles.${targetId}`]: role, updatedAt: nowIso() });
}

export async function kickMember(serverId, targetId) {
  await updateDoc(doc(firestore, SERVERS, serverId), {
    memberIds: arrayRemove(targetId),
    [`roles.${targetId}`]: deleteField(),
    updatedAt: nowIso()
  });
}

export async function banMember(serverId, targetId) {
  await updateDoc(doc(firestore, SERVERS, serverId), {
    memberIds: arrayRemove(targetId),
    [`roles.${targetId}`]: deleteField(),
    bannedIds: arrayUnion(targetId),
    updatedAt: nowIso()
  });
}

export async function unbanMember(serverId, targetId) {
  await updateDoc(doc(firestore, SERVERS, serverId), { bannedIds: arrayRemove(targetId), updatedAt: nowIso() });
}

export async function setMemberMuted(serverId, targetId, muted) {
  await updateDoc(doc(firestore, SERVERS, serverId), {
    mutedIds: muted ? arrayUnion(targetId) : arrayRemove(targetId),
    updatedAt: nowIso()
  });
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

function randomInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function inviteLinkFor(code) {
  const origin = typeof window !== 'undefined' && window.location?.protocol?.startsWith('http')
    ? window.location.origin
    : 'https://concord-3af70.web.app';
  return `${origin}/#invite=${code}`;
}

export async function createInvite(server, user, { channelId = null } = {}) {
  const code = randomInviteCode();
  const invite = {
    code,
    serverId: server.id,
    serverName: server.name,
    serverIcon: server.icon || '',
    serverDescription: server.description || '',
    channelId,
    creatorId: user.id,
    creatorUsername: user.username,
    createdAt: nowIso()
  };
  await setDoc(doc(firestore, INVITES, code), invite);
  return { ...invite, inviteLink: inviteLinkFor(code) };
}

export async function getInvite(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return null;
  const snap = await getDoc(doc(firestore, INVITES, clean));
  return snap.exists() ? snap.data() : null;
}

/** Joins the server behind an invite code. Returns the server document. */
export async function joinServerWithCode(code, userId) {
  const invite = await getInvite(code);
  if (!invite) throw new Error('Código de convite inválido ou expirado.');

  const ref = doc(firestore, SERVERS, invite.serverId);

  // Already a member? Reading succeeds only for members.
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) return { server: normalizeServer(existing.data(), userId), invite, alreadyMember: true };
  } catch (err) {
    if (err?.code !== 'permission-denied') throw err;
  }

  try {
    await updateDoc(ref, {
      memberIds: arrayUnion(userId),
      [`roles.${userId}`]: 'member',
      lastJoinCode: invite.code,
      updatedAt: nowIso()
    });
  } catch (err) {
    if (err?.code === 'permission-denied') {
      throw new Error('Não foi possível entrar neste servidor. Você pode ter sido banido ou o convite não é mais válido.');
    }
    if (err?.code === 'not-found') throw new Error('Este servidor não existe mais.');
    throw err;
  }

  const snap = await getDoc(ref);
  return { server: normalizeServer(snap.data(), userId), invite, alreadyMember: false };
}

export async function sendInviteToUser(invite, sender, receiver) {
  const id = newId('uinv');
  await setDoc(doc(firestore, USER_INVITES, id), {
    id,
    code: invite.code,
    serverId: invite.serverId,
    serverName: invite.serverName,
    serverIcon: invite.serverIcon || '',
    channelId: invite.channelId || null,
    senderId: sender.id,
    senderUsername: sender.username,
    receiverId: receiver.id,
    receiverUsername: receiver.username,
    status: 'pending',
    createdAt: nowIso()
  });
  return id;
}

export function listenToMyInvites(userId, callback) {
  const q = query(
    collection(firestore, USER_INVITES),
    where('receiverId', '==', String(userId)),
    where('status', '==', 'pending')
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data())),
    (err) => logWarn('listen invites', err)
  );
}

export async function markUserInvite(inviteId, status) {
  await updateDoc(doc(firestore, USER_INVITES, inviteId), { status, respondedAt: nowIso() });
}

export async function deleteUserInvite(inviteId) {
  await deleteDoc(doc(firestore, USER_INVITES, inviteId));
}

// ---------------------------------------------------------------------------
// Moderation log
// ---------------------------------------------------------------------------

export async function logAudit(serverId, actor, action, { targetId = null, targetName = null, details = '' } = {}) {
  try {
    const id = newId('audit');
    await setDoc(doc(firestore, AUDIT, id), {
      id,
      serverId,
      actorId: actor.id,
      actorName: actor.username,
      action,
      targetId,
      targetName,
      details,
      createdAt: nowIso()
    });
  } catch (err) {
    logWarn('audit log', err);
  }
}

export function listenToAudit(serverId, callback) {
  const q = query(collection(firestore, AUDIT), where('serverId', '==', serverId), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data())),
    (err) => logWarn('listen audit', err)
  );
}
