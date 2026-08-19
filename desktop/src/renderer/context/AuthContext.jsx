import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { 
  auth,
  checkRedirectResult, 
  signInWithEmail, 
  signUpWithEmail, 
  signOutFirebase 
} from '../services/firebase';
import { syncUserToCloud } from '../services/cloudSync';

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
    if (user) {
      syncUserToCloud(user);
    }
  }, [user]);

  const login = async (credentials) => {
    try {
      const data = await api.login(credentials);
      if (!data || !data.token || !data.user) {
        throw new Error('Resposta de autenticação inválida do servidor.');
      }
      api.setToken(data.token);
      setToken(data.token);
      setUser(data.user);
      return data;
    } catch (apiErr) {
      console.warn('Backend API login failed or not available, trying Firebase Auth:', apiErr);
      try {
        const fbUser = await signInWithEmail(credentials.login, credentials.password);
        const fbToken = fbUser.accessToken || ('fb_token_' + fbUser.uid);
        const fbSafeUser = {
          id: fbUser.uid,
          username: fbUser.displayName || credentials.login.split('@')[0],
          email: fbUser.email,
          avatar: fbUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(credentials.login)}`,
          status: 'online',
          createdAt: new Date().toISOString()
        };
        api.setToken(fbToken);
        setToken(fbToken);
        setUser(fbSafeUser);
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
      return data;
    } catch (apiErr) {
      console.warn('Backend API register failed or not available, trying Firebase Auth:', apiErr);
      try {
        const fbUser = await signUpWithEmail(userData.username, userData.email, userData.password);
        const fbToken = fbUser.accessToken || ('fb_token_' + fbUser.uid);
        const fbSafeUser = {
          id: fbUser.uid,
          username: userData.username.trim(),
          email: userData.email ? userData.email.trim() : fbUser.email,
          avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userData.username)}`,
          status: 'online',
          createdAt: new Date().toISOString()
        };
        api.setToken(fbToken);
        setToken(fbToken);
        setUser(fbSafeUser);
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
    try {
      const data = await api.updateProfile(profileData);
      if (data?.user) setUser(data.user);
      return data;
    } catch (apiErr) {
      console.warn('Backend API updateProfile not reachable, updating local profile:', apiErr);
      const cleanUsername = profileData.username ? profileData.username.trim().replace(/^@/, '') : user?.username;
      const updatedUser = {
        ...user,
        username: cleanUsername || user?.username,
        avatar: profileData.avatar !== undefined ? profileData.avatar : user?.avatar,
        status: profileData.status !== undefined ? profileData.status : user?.status
      };
      setUser(updatedUser);
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
