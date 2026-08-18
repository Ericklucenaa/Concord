import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut
} from 'firebase/auth';

import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  updateDoc, 
  arrayUnion, 
  deleteDoc 
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCHJQ3k7Xnc0bbs2n6YzCdIe6gfHmSDSjo",
  authDomain: "concord-3af70.firebaseapp.com",
  projectId: "concord-3af70",
  storageBucket: "concord-3af70.firebasestorage.app",
  messagingSenderId: "585039727575",
  appId: "1:585039727575:web:1510b9ce9761b9af2d1992"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Check if running in Electron desktop app vs Web Browser
const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return {
      uid: result.user.uid,
      displayName: result.user.displayName,
      email: result.user.email,
      photoURL: result.user.photoURL,
      accessToken: await result.user.getIdToken()
    };
  } catch (err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
      console.warn('Popup blocked, falling back to redirect flow:', err);
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

export async function checkRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      return {
        uid: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL,
        accessToken: await result.user.getIdToken()
      };
    }
  } catch (err) {
    console.error('Error getting redirect result:', err);
  }
  return null;
}

export async function signInWithEmail(emailOrUsername, password) {
  const cleanInput = emailOrUsername.trim();
  const email = cleanInput.includes('@') ? cleanInput : `${cleanInput.toLowerCase()}@concord.app`;
  const result = await signInWithEmailAndPassword(auth, email, password);
  return {
    uid: result.user.uid,
    displayName: result.user.displayName || cleanInput.split('@')[0],
    email: result.user.email,
    photoURL: result.user.photoURL,
    accessToken: await result.user.getIdToken()
  };
}

export async function signUpWithEmail(username, email, password) {
  const cleanUser = username.trim();
  const cleanEmail = email && email.trim() ? email.trim() : `${cleanUser.toLowerCase()}@concord.app`;
  const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  
  if (cleanUser) {
    try {
      await updateProfile(result.user, {
        displayName: cleanUser,
        photoURL: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUser)}`
      });
    } catch (e) {
      console.warn('Profile name update error:', e);
    }
  }

  return {
    uid: result.user.uid,
    displayName: cleanUser || cleanEmail.split('@')[0],
    email: result.user.email,
    photoURL: result.user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUser)}`,
    accessToken: await result.user.getIdToken()
  };
}

export async function signOutFirebase() {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Sign out error:', err);
  }
}
