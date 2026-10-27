import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn, quietly } from '../log';
import { newId } from './util';

const PRESENCE = 'concord_voice_presence';
const VOICE_SIGNALS = 'concord_voice_signals';
const SCREEN_SIGNALS = 'concord_screen_signals';
const SOUNDBOARD = 'concord_soundboard';

// Each participant refreshes `lastSeen` every VOICE_HEARTBEAT_MS; entries older
// than VOICE_STALE_MS (e.g. a crashed client) are hidden.
export const VOICE_HEARTBEAT_MS = 15_000;
export const VOICE_STALE_MS = 45_000;

// Temporary documents are removed by a Firestore TTL policy on `expireAt`.
const expireIn = (ms) => Timestamp.fromMillis(Date.now() + ms);

// ---------------------------------------------------------------------------
// Presence (one document per user, id = uid)
// ---------------------------------------------------------------------------

/**
 * `room` is a server voice channel ({ serverId, channelId }) or a DM call
 * ({ threadId, channelId: threadId }).
 */
export async function joinVoicePresence(user, room, state) {
  await setDoc(doc(firestore, PRESENCE, user.id), {
    userId: user.id,
    username: user.username,
    avatar: user.avatar || '',
    serverId: room.serverId || null,
    threadId: room.threadId || null,
    channelId: room.channelId,
    isMuted: Boolean(state.isMuted),
    isDeafened: Boolean(state.isDeafened),
    isScreenSharing: false,
    isCameraOn: false,
    joinedAt: Date.now(),
    lastSeen: Date.now()
  });
}

export async function updateVoicePresence(userId, fields) {
  await updateDoc(doc(firestore, PRESENCE, userId), { ...fields, lastSeen: Date.now() });
}

export async function leaveVoicePresence(userId) {
  await deleteDoc(doc(firestore, PRESENCE, userId));
}

/** Moderator action: remove someone else from voice. */
export async function disconnectFromVoice(targetUserId) {
  await deleteDoc(doc(firestore, PRESENCE, targetUserId));
}

/** All voice participants of a server (or of a DM call), grouped by channel id. */
export function listenToServerVoice(serverId, callback, field = 'serverId') {
  let latest = [];
  const emit = () => {
    const now = Date.now();
    const byChannel = new Map();
    latest
      .filter((p) => now - (Number(p.lastSeen) || 0) < VOICE_STALE_MS)
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))
      .forEach((p) => {
        if (!byChannel.has(p.channelId)) byChannel.set(p.channelId, []);
        byChannel.get(p.channelId).push(p);
      });
    callback(byChannel);
  };
  const unsub = onSnapshot(
    query(collection(firestore, PRESENCE), where(field, '==', serverId)),
    (snap) => {
      latest = snap.docs.map((d) => d.data());
      emit();
    },
    (err) => logWarn('listen voice presence', err)
  );
  const timer = setInterval(emit, 5000);
  return () => {
    clearInterval(timer);
    unsub();
  };
}

// ---------------------------------------------------------------------------
// WebRTC signaling
// ---------------------------------------------------------------------------

export function listenToThreadVoice(threadId, callback) {
  return listenToServerVoice(threadId, callback, 'threadId');
}

export async function sendVoiceSignal(channelId, senderId, targetId, type, data) {
  const id = newId('vsig');
  await setDoc(doc(firestore, VOICE_SIGNALS, id), {
    id,
    channelId: String(channelId),
    senderId,
    targetId: String(targetId),
    type,
    data: JSON.stringify(data),
    timestamp: Date.now(),
    expireAt: expireIn(5 * 60_000)
  });
}

/** Delivers each signal once and deletes it; signals older than 30 s are dropped. */
function listenToSignals(collectionName, targetField, myUserId, onSignal) {
  const seen = new Set();
  return onSnapshot(
    query(collection(firestore, collectionName), where(targetField, '==', myUserId)),
    (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added' || seen.has(change.doc.id)) return;
        seen.add(change.doc.id);
        const data = change.doc.data();
        quietly('delete signal', deleteDoc(change.doc.ref));
        const sentAt = data.timestamp || data.createdAt || 0;
        if (Date.now() - sentAt > 30_000) return;
        try {
          onSignal({ ...data, data: JSON.parse(data.data || 'null') });
        } catch (err) {
          logWarn('parse signal', err);
        }
      });
    },
    (err) => logWarn(`listen ${collectionName}`, err)
  );
}

export function listenToVoiceSignals(myUserId, onSignal) {
  return listenToSignals(VOICE_SIGNALS, 'targetId', myUserId, onSignal);
}

export async function sendScreenSignal(channelId, fromUserId, toUserId, type, data) {
  const id = newId('ssig');
  await setDoc(doc(firestore, SCREEN_SIGNALS, id), {
    channelId: String(channelId || ''),
    fromUserId,
    toUserId: String(toUserId),
    type,
    data: JSON.stringify(data ?? {}),
    createdAt: Date.now(),
    expireAt: expireIn(5 * 60_000)
  });
}

export function listenToScreenSignals(myUserId, onSignal) {
  return listenToSignals(SCREEN_SIGNALS, 'toUserId', myUserId, onSignal);
}

// ---------------------------------------------------------------------------
// Soundboard
// ---------------------------------------------------------------------------

export async function playSoundboard(serverId, channelId, user, soundId) {
  const id = newId('snd');
  const ref = doc(firestore, SOUNDBOARD, id);
  await setDoc(ref, {
    serverId,
    channelId,
    userId: user.id,
    username: user.username,
    soundId,
    createdAt: Date.now(),
    expireAt: expireIn(5 * 60_000)
  });
  // Listeners only react to fresh events, so the sender cleans up afterwards.
  setTimeout(() => quietly('soundboard cleanup', deleteDoc(ref)), 10_000);
}

export function listenToSoundboard(serverId, channelId, onSound) {
  const startedAt = Date.now();
  return onSnapshot(
    query(collection(firestore, SOUNDBOARD), where('serverId', '==', serverId), where('channelId', '==', channelId)),
    (snap) => {
      snap.docChanges().forEach((change) => {
        const data = change.doc.data();
        if (change.type === 'added' && data.createdAt >= startedAt - 2000 && Date.now() - data.createdAt < 10_000) {
          onSound(data);
        }
      });
    },
    (err) => logWarn('listen soundboard', err)
  );
}
