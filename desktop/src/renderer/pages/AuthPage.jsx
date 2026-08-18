import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { signInWithGoogle } from '../services/firebase';
import { Radio, Lock, Mail, User, ArrowRight } from 'lucide-react';

export default function AuthPage() {
  const { login, register, loginGoogle } = useAuth();
  const [isRegister, setIsRegister] = useState(false);

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isRegister) {
      if (password !== confirmPassword) {
        setError('As senhas não coincidem.');
        return;
      }
      if (password.length < 6) {
        setError('A senha deve ter no mínimo 6 caracteres.');
        return;
      }

      try {
        setIsLoading(true);
        await register({
          username: username.trim(),
          email: email.trim(),
          password
        });
      } catch (err) {
        setError(err.message || 'Erro ao criar conta.');
      } finally {
        setIsLoading(false);
      }
    } else {
      try {
        setIsLoading(true);
        await login({
          login: username.trim(),
          password
        });
      } catch (err) {
        setError(err.message || 'Credenciais inválidas.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setError('');
      const googleUser = await signInWithGoogle();
      if (googleUser) {
        await loginGoogle(googleUser);
      }
    } catch (err) {
      console.error('Google sign-in error:', err);
      if (
        err.code !== 'auth/popup-closed-by-user' && 
        err.code !== 'auth/cancelled-popup-request'
      ) {
        setError(err.message || 'Erro ao autenticar com a conta do Google.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <Radio className="auth-logo" />
          <h1 className="auth-title">CONCORD</h1>
          <p className="auth-subtitle">
            {isRegister 
              ? 'Crie sua conta para conversar e transmitir' 
              : 'Bem-vindo de volta! Faça login para continuar'}
          </p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {/* Google Sign-in Button */}
        <button
          type="button"
          className="btn"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '11px 0',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            backgroundColor: '#ffffff',
            color: '#3c4043',
            border: '1px solid #dadce0',
            fontWeight: 700,
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            cursor: 'pointer'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707 0-.59.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.547 0 9s.347 2.827.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          <span>
            {isLoading 
              ? 'Conectando ao Google...' 
              : (isRegister ? 'Cadastrar com o Google' : 'Continuar com o Google')}
          </span>
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
          <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border-color)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>ou com e-mail</span>
          <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border-color)' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">{isRegister ? 'Nome de Usuário' : 'Usuário ou E-mail'}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', paddingLeft: 36 }}
                placeholder={isRegister ? 'Seu apelido único' : 'usuario ou email@exemplo.com'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete={isRegister ? 'username' : 'email'}
                required
                autoFocus
              />
              <User size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
            </div>
          </div>

          {isRegister && (
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="form-input"
                  style={{ width: '100%', paddingLeft: 36 }}
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <Mail size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-input"
                style={{ width: '100%', paddingLeft: 36 }}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                required
              />
              <Lock size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
            </div>
          </div>

          {isRegister && (
            <div className="form-group">
              <label className="form-label">Confirmar Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="form-input"
                  style={{ width: '100%', paddingLeft: 36 }}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <Lock size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
              </div>
            </div>
          )}

          {!isRegister && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Lembrar login
              </label>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%', padding: '12px 0', fontSize: 15, marginTop: 4 }}
          >
            {isLoading ? 'Processando...' : (isRegister ? 'Criar Minha Conta' : 'Entrar')}
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="auth-switch">
          {isRegister ? (
            <span>
              Já tem uma conta?{' '}
              <a className="auth-link" onClick={() => { setIsRegister(false); setError(''); }}>
                Entrar agora
              </a>
            </span>
          ) : (
            <span>
              Ainda não tem conta?{' '}
              <a className="auth-link" onClick={() => { setIsRegister(true); setError(''); }}>
                Cadastre-se
              </a>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
