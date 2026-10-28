import { doc, getDoc } from 'firebase/firestore';
import { DEFAULT_ICE_SERVERS } from '@shared/constants';
import { firestore } from './firebase';
import { logWarn } from './log';

// STUN works for most home networks. Strict NATs (CGNAT, many 4G/fiber
// carriers, corporate networks) also need a TURN relay, which can come from:
//   - the Firestore doc concord_app_config/ice (set with scripts/set-turn.mjs,
//     no rebuild needed), or
//   - build-time env: VITE_TURN_URLS / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL.
const env = import.meta.env || {};

function buildTimeTurn() {
  if (!env.VITE_TURN_URLS) return [];
  return [{
    urls: env.VITE_TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
    username: env.VITE_TURN_USERNAME || '',
    credential: env.VITE_TURN_CREDENTIAL || ''
  }];
}

let remoteServers = [];
let loading = null;

function sanitize(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => ({
      urls: (Array.isArray(s?.urls) ? s.urls : [s?.urls]).filter((u) => typeof u === 'string' && /^(stun|turns?):/.test(u)),
      ...(s?.username ? { username: String(s.username) } : {}),
      ...(s?.credential ? { credential: String(s.credential) } : {})
    }))
    .filter((s) => s.urls.length > 0);
}

/** Fetches the relay config once per session (call after login). */
export function loadIceConfig() {
  if (!loading) {
    loading = getDoc(doc(firestore, 'concord_app_config', 'ice'))
      .then((snap) => {
        remoteServers = snap.exists() ? sanitize(snap.data().servers) : [];
      })
      .catch((err) => {
        logWarn('ice config', err);
        loading = null;
      });
  }
  return loading || Promise.resolve();
}

export function getIceServers() {
  return [...DEFAULT_ICE_SERVERS, ...buildTimeTurn(), ...remoteServers];
}

export function hasTurnServer() {
  return getIceServers().some((s) => [].concat(s.urls).some((u) => u.startsWith('turn')));
}
