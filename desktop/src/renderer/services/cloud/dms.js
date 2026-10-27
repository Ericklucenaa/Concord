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
import { dmThreadIdFor, newId, nowIso, sortedPair } from './util';

const THREADS = 'concord_dm_threads';

export const MAX_GROUP_SIZE = 10;

function profileOf(user) {
  return { username: user.username || 'Usuário', avatar: user.avatar || '' };
}

export function listenToMyThreads(userId, callback) {
  const q = query(collection(firestore, THREADS), where('participants', 'array-contains', userId));
  return onSnapshot(
    q,
    (snap) => {
      const threads = snap.docs.map((d) => d.data());
      threads.sort((a, b) => ((a.lastMessageAt || a.createdAt || '') < (b.lastMessageAt || b.createdAt || '') ? 1 : -1));
      callback(threads);
    },
    (err) => logWarn('listen threads', err)
  );
}

/** Returns the 1-on-1 thread with `other`, creating it on first contact. */
export async function ensureDirectThread(me, other) {
  const id = dmThreadIdFor(me.id, other.id);
  const ref = doc(firestore, THREADS, id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data();
  } catch (err) {
    // Reading a thread that does not exist yet is denied by the rules.
    if (err?.code !== 'permission-denied') throw err;
  }
  const thread = {
    id,
    isGroup: false,
    participants: sortedPair(me.id, other.id),
    profiles: { [me.id]: profileOf(me), [other.id]: profileOf(other) },
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await setDoc(ref, thread);
  return thread;
}

export async function createGroupThread(owner, members, name) {
  const all = [owner, ...members.filter((m) => m.id !== owner.id)];
  if (all.length < 2) throw new Error('Escolha pelo menos um amigo para o grupo.');
  if (all.length > MAX_GROUP_SIZE) throw new Error(`Grupos podem ter no máximo ${MAX_GROUP_SIZE} pessoas.`);
  const id = newId('grp');
  // The rules accept a new group with the owner and one friend; everyone else
  // is added one at a time so each addition can be checked (friends only,
  // not blocked).
  const [first, ...rest] = all.slice(1);
  const thread = {
    id,
    isGroup: true,
    ownerId: owner.id,
    name: (name || '').trim().slice(0, 60) || all.map((m) => m.username).join(', ').slice(0, 60),
    participants: [owner.id, first.id],
    profiles: { [owner.id]: profileOf(owner), [first.id]: profileOf(first) },
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  await setDoc(doc(firestore, THREADS, id), thread);
  await addGroupMembers(thread, rest);
  return { ...thread, participants: all.map((m) => m.id) };
}

export async function addGroupMembers(thread, members) {
  for (const m of members) {
    await updateDoc(doc(firestore, THREADS, thread.id), {
      participants: arrayUnion(m.id),
      lastAddedId: m.id,
      [`profiles.${m.id}`]: profileOf(m),
      updatedAt: nowIso()
    });
  }
}

export async function removeGroupMember(thread, memberId) {
  await updateDoc(doc(firestore, THREADS, thread.id), { participants: arrayRemove(memberId), updatedAt: nowIso() });
}

export async function renameGroup(thread, name) {
  await updateDoc(doc(firestore, THREADS, thread.id), { name: name.trim().slice(0, 60), updatedAt: nowIso() });
}

export async function leaveGroup(thread, userId) {
  if (thread.ownerId === userId) {
    const remaining = thread.participants.filter((p) => p !== userId);
    if (remaining.length === 0) {
      await deleteDoc(doc(firestore, THREADS, thread.id));
      return;
    }
    // The owner hands the group to the next participant before leaving.
    await updateDoc(doc(firestore, THREADS, thread.id), {
      ownerId: remaining[0],
      participants: remaining,
      updatedAt: nowIso()
    });
    return;
  }
  await updateDoc(doc(firestore, THREADS, thread.id), { participants: arrayRemove(userId), updatedAt: nowIso() });
}

/** Display info for a thread from the viewer's point of view. */
export function describeThread(thread, myId, profiles = new Map()) {
  const others = thread.participants.filter((p) => p !== myId);
  const profileFor = (id) => {
    const live = profiles.get(id);
    const cached = thread.profiles?.[id] || {};
    return { id, username: live?.username || cached.username || 'Usuário', avatar: live?.avatar || cached.avatar || '' };
  };
  if (!thread.isGroup) {
    const other = profileFor(others[0]);
    return { title: other.username, avatar: other.avatar, other, members: [other] };
  }
  const members = others.map(profileFor);
  return { title: thread.name || members.map((m) => m.username).join(', '), avatar: thread.icon || '', other: null, members };
}
