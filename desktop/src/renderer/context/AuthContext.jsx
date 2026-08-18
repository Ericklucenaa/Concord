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
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(api.getToken());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      // 1. Check if user just returned from Google sign-in redirect
      try {
        const redirectUser = await checkRedirectResult();
        if (redirectUser) {
          await loginGoogle(redirectUser);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Redirect result check error:', err);
      }

      // 2. Check stored token
      const storedToken = api.getToken();
      if (!storedToken || storedToken === 'undefined' || storedToken === 'null') {
        api.setToken(null);
        setToken(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const data = await api.getMe();
        if (data && data.user) {
          setUser(data.user);
          setToken(storedToken);
        } else {
          throw new Error('Resposta de usuário inválida');
        }
      } catch (err) {
        console.warn('Could not fetch user from backend API, checking Firebase session:', err);
        if (auth.currentUser) {
          const u = auth.currentUser;
          const restoredUser = {
            id: u.uid,
            username: u.displayName || u.email?.split('@')[0] || 'Usuário',
            email: u.email,
            avatar: u.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.email || u.uid)}`,
            status: 'online',
            createdAt: new Date().toISOString()
          };
          setUser(restoredUser);
          setToken(storedToken);
        } else {
          api.setToken(null);
          setToken(null);
          setUser(null);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
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
