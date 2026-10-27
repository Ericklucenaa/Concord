import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  onAuthStateChanged,
  updateProfile as updateAuthProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendEmailVerification,
  deleteUser
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  auth,
  firestore,
  checkRedirectResult,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOutFirebase,
  syntheticEmailFor
} from '../services/firebase';
import {
  claimNickname,
  getUserProfile,
  lookupNickname,
  saveUserProfile,
  validateNickname
} from '../services/cloud/users';
import { defaultAvatar } from '../services/cloud/util';
import { logWarn } from '../services/log';

const AuthContext = createContext(null);

function friendlyAuthError(err) {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
      return 'Credenciais inválidas. Verifique o usuário/e-mail e a senha.';
    case 'auth/invalid-email':
      return 'Formato de e-mail inválido.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas sem sucesso. Aguarde um momento e tente novamente.';
    case 'auth/email-already-in-use':
      return 'Este e-mail já está cadastrado.';
    case 'auth/weak-password':
      return 'A senha deve ter no mínimo 6 caracteres.';
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet.';
    default:
      return err?.message || 'Erro de autenticação.';
  }
}

/** Picks a free nickname for accounts created through Google. */
async function firstFreeNickname(base, userId) {
  const clean = (base || 'usuario').normalize('NFD').replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 24) || 'usuario';
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? clean : `${clean}${Math.floor(Math.random() * 9000) + 1000}`;
    const taken = await lookupNickname(candidate);
    if (!taken || taken.userId === userId) return candidate.length >= 2 ? candidate : `${candidate}_user`;
  }
  return `user${userId.slice(0, 8)}`;
}

/**
 * Makes sure the signed-in Firebase user has a Concord profile and a reserved
 * nickname (first Google login, or accounts created by older versions).
 */
async function ensureProfile(fbUser) {
  const existing = await getUserProfile(fbUser.uid).catch(() => null);
  if (existing?.username) return existing;

  const username = await firstFreeNickname(existing?.username || fbUser.displayName || fbUser.email?.split('@')[0], fbUser.uid);
  const avatar = existing?.avatar || fbUser.photoURL || defaultAvatar(username);
  await saveUserProfile(fbUser.uid, {
    username,
    avatar,
    status: 'online',
    userTag: fbUser.uid.substring(0, 4).toUpperCase(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    lastSeen: Date.now()
  });
  await claimNickname(fbUser.uid, username, { avatar, email: fbUser.email || '' }).catch((err) => logWarn('claim nickname', err));
  return getUserProfile(fbUser.uid);
}

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const profileUnsubRef = useRef(null);

  useEffect(() => {
    checkRedirectResult();

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      profileUnsubRef.current?.();
      profileUnsubRef.current = null;

      if (!fbUser) {
        setFirebaseUser(null);
        setProfile(null);
        setIsLoading(false);
        return;
      }

      try {
        const initial = await ensureProfile(fbUser);
        setFirebaseUser(fbUser);
        setProfile(initial);
      } catch (err) {
        logWarn('load profile', err);
        setFirebaseUser(fbUser);
      } finally {
        setIsLoading(false);
      }

      profileUnsubRef.current = onSnapshot(
        doc(firestore, 'concord_users', fbUser.uid),
        (snap) => snap.exists() && setProfile(snap.data()),
        (err) => logWarn('listen own profile', err)
      );
    });

    return () => {
      unsubscribe();
      profileUnsubRef.current?.();
    };
  }, []);

  const user = useMemo(() => (firebaseUser
    ? {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        username: profile?.username || firebaseUser.displayName || 'Usuário',
        avatar: profile?.avatar || firebaseUser.photoURL || defaultAvatar(firebaseUser.uid),
        status: profile?.status || 'online',
        customStatus: profile?.customStatus || null,
        userTag: profile?.userTag || firebaseUser.uid.substring(0, 4).toUpperCase(),
        onboardingDone: Boolean(profile?.onboardingDone),
        createdAt: profile?.createdAt,
        bio: profile?.bio || '',
        bannerColor: profile?.bannerColor || '',
        dmPolicy: profile?.dmPolicy || 'everyone',
        emailVerified: firebaseUser.emailVerified || (firebaseUser.email || '').endsWith('@concord.app'),
        isPasswordAccount: firebaseUser.providerData.some((p) => p.providerId === 'password')
      }
    : null),
  // Not `profile` itself: heartbeats rewrite `lastSeen` every minute and must
  // not rebuild the user object (and every effect depending on it).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [firebaseUser, profile?.username, profile?.avatar, profile?.status, JSON.stringify(profile?.customStatus || null),
    profile?.userTag, profile?.onboardingDone, profile?.createdAt, profile?.bio, profile?.bannerColor, profile?.dmPolicy]);

  const login = async ({ login: identifier, password }) => {
    const value = String(identifier || '').trim();
    let email = value;
    if (!value.includes('@')) {
      const entry = await lookupNickname(value);
      email = entry?.email || syntheticEmailFor(value);
    }
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      throw new Error(friendlyAuthError(err));
    }
  };

  const register = async ({ username, email, password }) => {
    const nick = validateNickname(username);
    const taken = await lookupNickname(nick);
    if (taken) throw new Error(`O apelido @${nick} já está em uso. Escolha outro.`);

    const loginEmail = email?.trim() || syntheticEmailFor(nick);
    const avatar = defaultAvatar(nick);
    let fbUser;
    try {
      fbUser = await signUpWithEmail(nick, loginEmail, password, avatar);
    } catch (err) {
      throw new Error(friendlyAuthError(err));
    }
    await saveUserProfile(fbUser.uid, {
      username: nick,
      avatar,
      status: 'online',
      userTag: fbUser.uid.substring(0, 4).toUpperCase(),
      createdAt: new Date().toISOString(),
      lastSeen: Date.now()
    });
    await claimNickname(fbUser.uid, nick, { avatar, email: loginEmail });
    if (!loginEmail.endsWith('@concord.app')) {
      sendEmailVerification(fbUser).catch((err) => logWarn('email verification', err));
    }
    setProfile(await getUserProfile(fbUser.uid));
  };

  const loginGoogle = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      throw new Error(friendlyAuthError(err));
    }
  };

  const logout = useCallback(async () => {
    window.dispatchEvent(new Event('concord:before-logout'));
    await signOutFirebase();
  }, []);

  const updateProfile = async (changes) => {
    if (!firebaseUser) return null;
    const fields = {};

    if (changes.username !== undefined && changes.username.trim().replace(/^@/, '') !== profile?.username) {
      const nick = await claimNickname(firebaseUser.uid, changes.username, {
        avatar: changes.avatar ?? profile?.avatar ?? '',
        email: firebaseUser.email || '',
        previous: profile?.username
      });
      fields.username = nick;
      updateAuthProfile(firebaseUser, { displayName: nick }).catch((err) => logWarn('auth display name', err));
    }
    if (changes.avatar !== undefined) fields.avatar = changes.avatar;
    if (changes.status !== undefined) fields.status = changes.status;
    if (changes.customStatus !== undefined) fields.customStatus = changes.customStatus;
    if (changes.onboardingDone !== undefined) fields.onboardingDone = changes.onboardingDone;
    if (changes.bio !== undefined) fields.bio = String(changes.bio).slice(0, 190);
    if (changes.bannerColor !== undefined) fields.bannerColor = changes.bannerColor;
    if (changes.dmPolicy !== undefined) fields.dmPolicy = changes.dmPolicy === 'friends' ? 'friends' : 'everyone';
    if (changes.activity !== undefined) fields.activity = changes.activity;

    if (Object.keys(fields).length > 0) {
      await saveUserProfile(firebaseUser.uid, fields);
      setProfile((prev) => ({ ...(prev || {}), ...fields }));
    }
    return { user: { ...user, ...fields } };
  };

  const changePassword = async (currentPassword, newPassword) => {
    if (!firebaseUser?.email) throw new Error('Esta conta não usa senha (login pelo Google).');
    if (!newPassword || newPassword.length < 6) throw new Error('A nova senha deve ter no mínimo 6 caracteres.');
    try {
      await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, currentPassword));
      await updatePassword(firebaseUser, newPassword);
    } catch (err) {
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        throw new Error('A senha atual está incorreta.');
      }
      throw new Error(friendlyAuthError(err));
    }
  };

  const resendVerification = async () => {
    if (!firebaseUser) return;
    await sendEmailVerification(firebaseUser);
  };

  /**
   * Deletes every piece of account data (see services/cloud/account) and then
   * the login itself. Password accounts must confirm their password.
   */
  const deleteAccount = async (password, removeData) => {
    if (!firebaseUser) return;
    if (firebaseUser.providerData.some((p) => p.providerId === 'password')) {
      try {
        await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, password));
      } catch (err) {
        throw new Error(err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' ? 'Senha incorreta.' : friendlyAuthError(err));
      }
    }
    window.dispatchEvent(new Event('concord:before-logout'));
    await removeData();
    try {
      await deleteUser(firebaseUser);
    } catch (err) {
      if (err?.code === 'auth/requires-recent-login') throw new Error('Por segurança, saia e entre de novo antes de excluir a conta.');
      throw new Error(friendlyAuthError(err));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(firebaseUser),
        isLoading,
        login,
        register,
        loginGoogle,
        logout,
        updateProfile,
        changePassword,
        resendVerification,
        deleteAccount
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
