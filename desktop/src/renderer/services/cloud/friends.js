import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn } from '../log';
import { findUserByNickname } from './users';
import { cleanNickname, nowIso, pairIdFor, sortedPair } from './util';

const FRIENDS = 'concord_friends';
const BLOCKS = 'concord_blocks';

function profileOf(user) {
  return { username: user.username || 'Usuário', avatar: user.avatar || '' };
}

export function listenToFriendships(userId, callback) {
  const q = query(collection(firestore, FRIENDS), where('participants', 'array-contains', userId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
    (err) => logWarn('listen friends', err)
  );
}

/** Sends a request, or accepts one the other person already sent. */
export async function sendFriendRequest(me, targetNickname) {
  const nick = cleanNickname(targetNickname);
  if (!nick) throw new Error('Informe o apelido do amigo.');
  if (nick.toLowerCase() === (me.username || '').toLowerCase()) {
    throw new Error('Você não pode adicionar a si mesmo como amigo.');
  }

  const target = await findUserByNickname(nick);
  if (!target?.id) throw new Error(`Nenhum usuário encontrado com o apelido @${nick}.`);

  const id = pairIdFor(me.id, target.id);
  const ref = doc(firestore, FRIENDS, id);

  let existing = null;
  try {
    const snap = await getDoc(ref);
    existing = snap.exists() ? snap.data() : null;
  } catch (err) {
    if (err?.code !== 'permission-denied') throw err;
  }

  if (existing?.status === 'accepted') throw new Error(`Você e @${target.username} já são amigos.`);
  if (existing?.status === 'pending') {
    if (existing.requesterId === me.id) throw new Error(`Pedido para @${target.username} já está pendente.`);
    await respondFriendRequest(existing, 'accept', me);
    return { accepted: true, target };
  }

  await setDoc(ref, {
    id,
    participants: sortedPair(me.id, target.id),
    requesterId: me.id,
    status: 'pending',
    profiles: { [me.id]: profileOf(me), [target.id]: profileOf(target) },
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
  return { accepted: false, target };
}

export async function respondFriendRequest(friendship, action, me) {
  const ref = doc(firestore, FRIENDS, friendship.id);
  if (action === 'accept') {
    await updateDoc(ref, { status: 'accepted', [`profiles.${me.id}`]: profileOf(me), updatedAt: nowIso() });
  } else {
    await deleteDoc(ref);
  }
}

export async function removeFriendship(friendshipId) {
  await deleteDoc(doc(firestore, FRIENDS, friendshipId));
}

/** Friendship docs from my point of view. */
export function describeFriendship(f, myId) {
  const otherId = f.participants.find((p) => p !== myId);
  const profile = f.profiles?.[otherId] || {};
  return {
    friendshipId: f.id,
    id: otherId,
    username: profile.username || 'Usuário',
    avatar: profile.avatar || '',
    status: f.status,
    incoming: f.status === 'pending' && f.requesterId !== myId,
    outgoing: f.status === 'pending' && f.requesterId === myId
  };
}

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

export function listenToBlocks(userId, callback) {
  return onSnapshot(
    doc(firestore, BLOCKS, userId),
    (snap) => callback(snap.exists() ? snap.data().blockedIds || [] : []),
    (err) => logWarn('listen blocks', err)
  );
}

export async function blockUser(userId, targetId) {
  await setDoc(doc(firestore, BLOCKS, userId), { blockedIds: arrayUnion(targetId), updatedAt: nowIso() }, { merge: true });
}

export async function unblockUser(userId, targetId) {
  await setDoc(doc(firestore, BLOCKS, userId), { blockedIds: arrayRemove(targetId), updatedAt: nowIso() }, { merge: true });
}
