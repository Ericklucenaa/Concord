import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  auth,
  checkRedirectResult, 
  signInWithEmail, 
  signUpWithEmail, 
  signOutFirebase 
} from '../services/firebase';
import { syncUserToCloud, setUserPresenceInCloud, findUserByNicknameInCloud } from '../services/cloudSync';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('concord_cached_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState(api.getToken());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // 1. Listen to Firebase Auth state changes
    const unsubscribeAuth = auth.onAuthStateChanged(async (fbUser) => {
      if (!isMounted) return;

      if (fbUser) {
        const token = await fbUser.getIdToken().catch(() => 'fb_token_' + fbUser.uid);
        api.setToken(token);
        setToken(token);

        let currentUserData = null;
        try {
          const cached = localStorage.getItem('concord_cached_user');
          if (cached) currentUserData = JSON.parse(cached);
        } catch (e) {}

        const restoredUser = {
          id: fbUser.uid,
          username: currentUserData?.username || fbUser.displayName || fbUser.email?.split('@')[0] || 'Usuário',
          email: fbUser.email,
          avatar: currentUserData?.avatar || fbUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(fbUser.email || fbUser.uid)}`,
          status: 'online',
          customStatus: currentUserData?.customStatus || '',
          createdAt: currentUserData?.createdAt || new Date().toISOString()
        };

        setUser(restoredUser);
        try { localStorage.setItem('concord_cached_user', JSON.stringify(restoredUser)); } catch (e) {}
        setIsLoading(false);
      } else {
        // If not in Firebase Auth, check local backend API if configured
        const storedToken = api.getToken();
        if (storedToken && api.hasBackend()) {
          try {
            const data = await api.getMe();
            if (isMounted && data && data.user) {
              setUser(data.user);
              try { localStorage.setItem('concord_cached_user', JSON.stringify(data.user)); } catch (e) {}
              setIsLoading(false);
              return;
            }
          } catch (err) {}
        }

        if (isMounted && !fbUser) {
          const cached = localStorage.getItem('concord_cached_user');
          if (!storedToken && !cached) {
            setUser(null);
          }
          setIsLoading(false);
        }
      }
    });

    // 2. Check if user just returned from Google sign-in redirect
    async function checkRedirect() {
      try {
        const redirectUser = await checkRedirectResult();
        if (redirectUser && isMounted) {
          await loginGoogle(redirectUser);
        }
      } catch (err) {}
    }
    checkRedirect();

    return () => {
      isMounted = false;
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    if (user?.id) {
      syncUserToCloud(user);
      setUserPresenceInCloud(user.id, user.username, 'online');

      const handleUnload = () => {
        setUserPresenceInCloud(user.id, user.username, 'offline');
      };

      window.addEventListener('beforeunload', handleUnload);
      window.addEventListener('pagehide', handleUnload);

      return () => {
        window.removeEventListener('beforeunload', handleUnload);
        window.removeEventListener('pagehide', handleUnload);
      };
    }
  }, [user?.id, user?.username]);

  const login = async (credentials) => {
    try {
      const data = await api.login(credentials);
      if (!data || !data.token || !data.user) {
        throw new Error('Resposta de autenticação inválida do servidor.');
      }
      api.setToken(data.token);
      setToken(data.token);
      setUser(data.user);
      try { localStorage.setItem('concord_cached_user', JSON.stringify(data.user)); } catch (e) {}
      return data;
    } catch (apiErr) {
      console.warn('Backend API login failed or not available, trying Firebase Auth:', apiErr);
      try {
        let loginEmail = credentials.login.trim();
        let customUsername = credentials.login.trim();
        let customAvatar = null;

        // If user provided a username rather than an email, look up their cloud user
        if (!loginEmail.includes('@')) {
          const userDoc = await findUserByNicknameInCloud(loginEmail);
          if (userDoc) {
            if (userDoc.email) {
              loginEmail = userDoc.email;
            } else {
              loginEmail = `${loginEmail.toLowerCase()}@concord.app`;
            }
            if (userDoc.username) customUsername = userDoc.username;
            if (userDoc.avatar) customAvatar = userDoc.avatar;
          } else {
            loginEmail = `${loginEmail.toLowerCase()}@concord.app`;
          }
        }

        const fbUser = await signInWithEmail(loginEmail, credentials.password);
        const fbToken = fbUser.accessToken || ('fb_token_' + fbUser.uid);
        const fbSafeUser = {
          id: fbUser.uid,
          username: customUsername || fbUser.displayName || credentials.login.split('@')[0],
          email: fbUser.email,
          avatar: customAvatar || fbUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(credentials.login)}`,
          status: 'online',
          createdAt: new Date().toISOString()
        };
        api.setToken(fbToken);
        setToken(fbToken);
        setUser(fbSafeUser);
        try { localStorage.setItem('concord_cached_user', JSON.stringify(fbSafeUser)); } catch (e) {}
        syncUserToCloud(fbSafeUser);
        return { user: fbSafeUser, token: fbToken };
      } catch (fbErr) {
        console.error('Firebase Auth sign in error:', fbErr);
        if (
          fbErr.code === 'auth/invalid-credential' || 
          fbErr.code === 'auth/user-not-found' || 
          fbErr.code === 'auth/wrong-password' ||
          fbErr.code === 'auth/invalid-login-credentials'
        ) {
          throw new Error('Credenciais inválidas. Verifique o usuário/e-mail e a senha.');
        } else if (fbErr.code === 'auth/invalid-email') {
          throw new Error('Formato de e-mail inválido.');
        } else if (fbErr.code === 'auth/too-many-requests') {
          throw new Error('Muitas tentativas sem sucesso. Aguarde um momento e tente novamente.');
        }
        throw new Error(fbErr.message || apiErr.message || 'Erro ao realizar login.');
      }
    }
  };

  const register = async (userData) => {
    try {
      const data = await api.register(userData);
      if (!data || !data.token || !data.user) {
        throw new Error('Resposta inválida ao cadastrar usuário.');
      }
      api.setToken(data.token);
      setToken(data.token);
      setUser(data.user);
      try { localStorage.setItem('concord_cached_user', JSON.stringify(data.user)); } catch (e) {}
      return data;
    } catch (apiErr) {
      console.warn('Backend API register failed or not available, trying Firebase Auth:', apiErr);
      try {
        let regEmail = userData.email ? userData.email.trim() : '';
        if (!regEmail) {
          regEmail = `${userData.username.trim().toLowerCase()}@concord.app`;
        }
        const fbUser = await signUpWithEmail(userData.username, regEmail, userData.password);
        const fbToken = fbUser.accessToken || ('fb_token_' + fbUser.uid);
        const fbSafeUser = {
          id: fbUser.uid,
          username: userData.username.trim(),
          email: regEmail,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userData.username)}`,
          status: 'online',
          createdAt: new Date().toISOString()
        };
        api.setToken(fbToken);
        setToken(fbToken);
        setUser(fbSafeUser);
        try { localStorage.setItem('concord_cached_user', JSON.stringify(fbSafeUser)); } catch (e) {}
        syncUserToCloud(fbSafeUser);
        return { user: fbSafeUser, token: fbToken };
      } catch (fbErr) {
        console.error('Firebase Auth register error:', fbErr);
        if (fbErr.code === 'auth/email-already-in-use') {
          throw new Error('Este e-mail já está cadastrado.');
        } else if (fbErr.code === 'auth/weak-password') {
          throw new Error('A senha deve ter no mínimo 6 caracteres.');
        } else if (fbErr.code === 'auth/invalid-email') {
          throw new Error('Formato de e-mail inválido.');
        }
        throw new Error(fbErr.message || apiErr.message || 'Erro ao cadastrar usuário.');
      }
    }
  };

  const loginGoogle = async (googleUser) => {
    try {
      const data = await api.loginWithGoogle({
        email: googleUser.email,
        displayName: googleUser.displayName,
        photoURL: googleUser.photoURL,
        uid: googleUser.uid
      });
      api.setToken(data.token);
      setToken(data.token);
      setUser(data.user);
      return data;
    } catch (apiErr) {
      console.warn('Backend API login with Google not reachable, using direct Firebase session:', apiErr);
      const fallbackUser = {
        id: googleUser.uid,
        username: googleUser.displayName || googleUser.email.split('@')[0],
        email: googleUser.email,
        avatar: googleUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(googleUser.email)}`,
        status: 'online',
        createdAt: new Date().toISOString()
      };
      const fallbackToken = googleUser.accessToken || ('firebase_token_' + googleUser.uid);
      api.setToken(fallbackToken);
      setToken(fallbackToken);
      setUser(fallbackUser);
      return { user: fallbackUser, token: fallbackToken };
    }
  };

  const logout = () => {
    signOutFirebase();
    api.setToken(null);
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (profileData) => {
    const cleanUsername = profileData.username ? profileData.username.trim().replace(/^@/, '') : user?.username;
    const updatedUser = {
      ...user,
      username: cleanUsername || user?.username,
      avatar: profileData.avatar !== undefined ? profileData.avatar : user?.avatar,
      status: profileData.status !== undefined ? profileData.status : user?.status,
      customStatus: profileData.customStatus !== undefined ? profileData.customStatus : user?.customStatus
    };

    // 1. Update state and localStorage immediately
    setUser(updatedUser);
    try { localStorage.setItem('concord_cached_user', JSON.stringify(updatedUser)); } catch (e) {}

    // 2. Sync to Firestore Cloud in real time
    if (updatedUser.id) {
      syncUserToCloud(updatedUser);
      setUserPresenceInCloud(updatedUser.id, updatedUser.username, updatedUser.status || 'online');
    }

    // 3. Update backend API if available
    try {
      const data = await api.updateProfile(profileData);
      if (data?.user) {
        setUser(data.user);
        try { localStorage.setItem('concord_cached_user', JSON.stringify(data.user)); } catch (e) {}
      }
      return { user: data?.user || updatedUser };
    } catch (apiErr) {
      return { user: updatedUser };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(user && token),
        isLoading,
        login,
        register,
        loginGoogle,
        logout,
        updateProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
