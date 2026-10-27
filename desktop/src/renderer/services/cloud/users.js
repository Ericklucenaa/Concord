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
  runTransaction
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn } from '../log';
import { chunk, cleanNickname, nowIso } from './util';

const USERS = 'concord_users';
const NICKNAMES = 'concord_nicknames';

// Presence: clients write `lastSeen` every HEARTBEAT_MS; anyone silent for
// longer than ONLINE_WINDOW_MS is shown offline.
export const HEARTBEAT_MS = 60_000;
export const ONLINE_WINDOW_MS = 150_000;

export const NICKNAME_PATTERN = /^[a-zA-Z0-9_.]{2,32}$/;

export function validateNickname(raw) {
  const nick = cleanNickname(raw);
  if (!NICKNAME_PATTERN.test(nick)) {
    throw new Error('O apelido deve ter de 2 a 32 caracteres: letras, números, "_" ou ".".');
  }
  return nick;
}

export async function getUserProfile(userId) {
  if (!userId) return null;
  const snap = await getDoc(doc(firestore, USERS, String(userId)));
  return snap.exists() ? snap.data() : null;
}

export async function saveUserProfile(userId, fields) {
  const data = { ...fields, id: String(userId), updatedAt: nowIso() };
  if (fields.username) data.usernameLower = fields.username.toLowerCase();
  await setDoc(doc(firestore, USERS, String(userId)), data, { merge: true });
}

/** Nickname registry entry (public by id, used for username login and lookups). */
export async function lookupNickname(raw) {
  const nick = cleanNickname(raw).toLowerCase();
  if (!nick) return null;
  try {
    const snap = await getDoc(doc(firestore, NICKNAMES, nick));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    logWarn('lookup nickname', err);
    return null;
  }
}

/**
 * Reserves a nickname for this user. Throws if someone else holds it.
 * Releases the user's previous nickname when renaming.
 */
export async function claimNickname(userId, username, { avatar = '', email = '', previous = null } = {}) {
  const nick = validateNickname(username);
  const key = nick.toLowerCase();
  const ref = doc(firestore, NICKNAMES, key);

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data().userId !== String(userId)) {
      throw new Error(`O apelido @${nick} já está em uso. Escolha outro.`);
    }
    tx.set(ref, { userId: String(userId), username: nick, avatar, email, updatedAt: nowIso() }, { merge: true });
  });

  const previousKey = previous ? cleanNickname(previous).toLowerCase() : null;
  if (previousKey && previousKey !== key) {
    try {
      const old = await getDoc(doc(firestore, NICKNAMES, previousKey));
      if (old.exists() && old.data().userId === String(userId)) {
        await deleteDoc(old.ref);
      }
    } catch (err) {
      logWarn('release old nickname', err);
    }
  }
  return nick;
}

export async function findUserByNickname(raw) {
  const entry = await lookupNickname(raw);
  if (!entry?.userId) return null;
  const profile = await getUserProfile(entry.userId).catch(() => null);
  return profile || { id: entry.userId, username: entry.username, avatar: entry.avatar };
}

export async function sendHeartbeat(userId, extra = {}) {
  if (!userId) return;
  try {
    await updateDoc(doc(firestore, USERS, String(userId)), { lastSeen: Date.now(), ...extra });
  } catch (err) {
    // The profile may not exist yet on first login; fall back to a merge write.
    if (err?.code === 'not-found') {
      await setDoc(doc(firestore, USERS, String(userId)), { id: String(userId), lastSeen: Date.now(), ...extra }, { merge: true });
    } else {
      logWarn('presence heartbeat', err);
    }
  }
}

export function effectiveStatus(profile, now = Date.now()) {
  if (!profile) return 'offline';
  if (profile.status === 'invisible' || profile.status === 'offline') return 'offline';
  const lastSeen = Number(profile.lastSeen) || 0;
  if (now - lastSeen > ONLINE_WINDOW_MS) return 'offline';
  const status = profile.status || 'online';
  return status === 'online' && profile.autoIdle ? 'idle' : status;
}

export function activeCustomStatus(profile, now = Date.now()) {
  const cs = profile?.customStatus;
  if (!cs || (!cs.text && !cs.emoji)) return null;
  if (cs.expiresAt && new Date(cs.expiresAt).getTime() < now) return null;
  return cs;
}

/**
 * Listens to a specific set of user profiles (presence + profile data).
 * Only the users the UI actually shows are watched, instead of the whole
 * collection, which keeps reads proportional to what is on screen.
 */
export function listenToUsers(userIds, callback) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean).map(String)));
  if (ids.length === 0) {
    callback(new Map());
    return () => {};
  }

  const results = new Map();
  const unsubs = chunk(ids, 30).map((batch) =>
    onSnapshot(
      query(collection(firestore, USERS), where('id', 'in', batch)),
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === 'removed') results.delete(change.doc.id);
          else results.set(change.doc.id, change.doc.data());
        });
        callback(new Map(results));
      },
      (err) => logWarn('listen users', err)
    )
  );

  return () => unsubs.forEach((u) => u());
}
