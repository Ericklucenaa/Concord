import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn } from '../log';

// Read-only on the client. Published with admin credentials by
// scripts/publish-release.mjs; the Firestore rules deny client writes.
const versionRef = () => doc(firestore, 'concord_app_version', 'latest');

export async function getLatestAppVersion() {
  try {
    const snap = await getDoc(versionRef());
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    logWarn('get app version', err);
    return null;
  }
}

export function listenToAppVersion(callback) {
  return onSnapshot(
    versionRef(),
    (snap) => snap.exists() && callback(snap.data()),
    (err) => logWarn('listen app version', err)
  );
}

/** Semver comparison: positive when a > b. */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
