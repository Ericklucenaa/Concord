import { doc, setDoc, onSnapshot, deleteField } from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn } from '../log';

// Synced notification preferences (per account, all devices):
//   mutedChannels / mutedServers: { [id]: untilMs }  (0 = until turned back on)
//   serverNotify: { [serverId]: 'all' | 'mentions' | 'none' }
const SETTINGS = 'concord_user_settings';

export const EMPTY_PREFS = { mutedChannels: {}, mutedServers: {}, serverNotify: {} };

export function listenToNotificationPrefs(userId, callback) {
  return onSnapshot(
    doc(firestore, SETTINGS, userId),
    (snap) => callback({ ...EMPTY_PREFS, ...(snap.exists() ? snap.data() : {}) }),
    (err) => logWarn('listen notification prefs', err)
  );
}

export const MUTE_DURATIONS = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '8h': 8 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  forever: 0
};

export async function setMuted(userId, kind, id, duration) {
  const field = kind === 'server' ? 'mutedServers' : 'mutedChannels';
  const value = duration === null ? deleteField() : duration === 0 ? 0 : Date.now() + duration;
  await setDoc(doc(firestore, SETTINGS, userId), { [field]: { [id]: value } }, { merge: true });
}

export async function setServerNotify(userId, serverId, level) {
  await setDoc(doc(firestore, SETTINGS, userId), { serverNotify: { [serverId]: level } }, { merge: true });
}

export function isMutedNow(map, id, now = Date.now()) {
  if (!map || !(id in map)) return false;
  const until = map[id];
  return until === 0 || until > now;
}
