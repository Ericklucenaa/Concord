import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  setPersistence,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { logWarn } from './log';

const firebaseConfig = {
  apiKey: 'AIzaSyCHJQ3k7Xnc0bbs2n6YzCdIe6gfHmSDSjo',
  authDomain: 'concord-3af70.firebaseapp.com',
  projectId: 'concord-3af70',
  storageBucket: 'concord-3af70.firebasestorage.app',
  messagingSenderId: '585039727575',
  appId: '1:585039727575:web:1510b9ce9761b9af2d1992'
};

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const useEmulator = env.VITE_FIREBASE_EMULATOR === '1';
const hasIndexedDB = typeof indexedDB !== 'undefined';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline cache keeps the app usable on flaky connections and cuts repeated
// document reads (and Firestore billing) when switching channels.
export const firestore = initializeFirestore(
  app,
  hasIndexedDB && !useEmulator
    ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }
    : {}
);

if (useEmulator) {
  connectAuthEmulator(auth, `http://${env.VITE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`, { disableWarnings: true });
  const [host, port] = (env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  connectFirestoreEmulator(firestore, host, Number(port));
} else if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(() =>
    setPersistence(auth, indexedDBLocalPersistence).catch((err) => logWarn('auth persistence', err))
  );
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Google sign-in. In the browser this opens a popup. Inside Electron the popup
 * is blocked by Google, so the main process opens the hosted bridge page, which
 * returns the Google OAuth credential (not a Firebase session), and we sign in
 * with it here so this renderer owns a real Firebase Auth session.
 */
export async function signInWithGoogle() {
  if (typeof window !== 'undefined' && window.electronAPI?.signInWithGoogleNative) {
    const credentialData = await window.electronAPI.signInWithGoogleNative();
    if (!credentialData) return null;
    const credential = GoogleAuthProvider.credential(credentialData.idToken || null, credentialData.accessToken || null);
    const result = await signInWithCredential(auth, credential);
    return result.user;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

/** Used by the hosted bridge page: signs in with a popup and returns the raw OAuth credential. */
export async function getGoogleOAuthCredential() {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential) throw new Error('O Google não retornou uma credencial válida.');
  return { idToken: credential.idToken || null, accessToken: credential.accessToken || null };
}

export async function checkRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (err) {
    logWarn('google redirect result', err);
    return null;
  }
}

export function syntheticEmailFor(username) {
  return `${username.trim().toLowerCase()}@concord.app`;
}

export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signUpWithEmail(username, email, password, avatar) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await updateProfile(result.user, { displayName: username, photoURL: avatar });
  } catch (err) {
    logWarn('auth profile update', err);
  }
  return result.user;
}

export async function signOutFirebase() {
  try {
    await signOut(auth);
  } catch (err) {
    logWarn('sign out', err);
  }
}

export async function resetPasswordWithEmail(email) {
  if (!email || !email.trim()) throw new Error('Informe seu e-mail para receber o link de redefinição.');
  await sendPasswordResetEmail(auth, email.trim());
  return true;
}
