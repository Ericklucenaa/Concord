import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ServerProvider, useServer } from './context/ServerContext';
import { VoiceProvider, useVoice } from './context/VoiceContext';
import { ScreenShareProvider, useScreenShare } from './context/ScreenShareContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import { DMProvider } from './context/DMContext';
import { PresenceProvider } from './context/PresenceContext';
import { UnreadProvider } from './context/UnreadContext';
import { OverlayUIProvider } from './context/OverlayUIContext';
import { reportError, installGlobalErrorHandlers } from './services/errorReporting';

import TitleBar from './components/TitleBar';
import ServerSidebar from './components/ServerSidebar';
import ChannelSidebar from './components/ChannelSidebar';
import DirectMessagesSidebar from './components/DirectMessagesSidebar';
import ChatArea from './components/ChatArea';
import DirectChatArea from './components/DirectChatArea';
import VoiceRoomArea from './components/VoiceRoomArea';
import MemberListSidebar from './components/MemberListSidebar';
import MiniStreamPlayer from './components/MiniStreamPlayer';
import IncomingCallBanner from './components/IncomingCallBanner';
import { useEventReminders } from './components/modals/EventsModal';
import { requestNotificationPermission } from './services/notificationService';
import { updateSettings, getSettings } from './services/settings';

import CreateServerModal from './components/modals/CreateServerModal';
import CreateChannelModal from './components/modals/CreateChannelModal';
import InviteModal from './components/modals/InviteModal';
import PendingInvitesModal from './components/modals/PendingInvitesModal';
import ScreenSharePickerModal from './components/modals/ScreenSharePickerModal';
import SettingsModal from './components/modals/SettingsModal';
import ServerSettingsModal from './components/modals/ServerSettingsModal';
import UpdateNotificationModal from './components/modals/UpdateNotificationModal';
import QuickSwitcher from './components/modals/QuickSwitcher';
import CreateGroupModal from './components/modals/CreateGroupModal';
import OnboardingModal from './components/modals/OnboardingModal';

import AuthPage from './pages/AuthPage';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    reportError(error, `render:${String(errorInfo?.componentStack || '').trim().split('\n')[0]}`);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, textAlign: 'center', color: '#f87171', backgroundColor: 'var(--bg-secondary)', borderRadius: 8, margin: 20, border: '1px solid #ef4444' }}>
          <h3>Ops! Ocorreu um erro inesperado nesta seção.</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{this.state.error?.message || 'Erro desconhecido'}</p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 10 }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Tentar Novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function readInviteCodeFromUrl() {
  const { hash, search } = window.location;
  const fromHash = hash.match(/invite=([a-zA-Z0-9]+)/);
  if (fromHash) return fromHash[1];
  return new URLSearchParams(search).get('invite');
}

/** App-wide keyboard shortcuts. */
function useGlobalShortcuts() {
  const { openModal, activeServer, activeChannel, visibleChannels, setActiveChannel } = useServer();
  const { toggleMute } = useVoice();
  const state = useRef({});
  state.current = { activeServer, activeChannel, visibleChannels, setActiveChannel, toggleMute, openModal };

  useEffect(() => {
    const onKey = (e) => {
      const s = state.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.openModal('quickSwitcher');
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        s.toggleMute();
      } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && s.activeServer) {
        e.preventDefault();
        const text = s.visibleChannels.filter((c) => c.type === 'text');
        const idx = text.findIndex((c) => c.id === s.activeChannel?.id);
        const next = text[(idx + (e.key === 'ArrowDown' ? 1 : -1) + text.length) % text.length];
        if (next) s.setActiveChannel(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Publishes the game detected by the desktop app as "Jogando agora". */
function useGameActivity() {
  const { user, updateProfile } = useAuth();
  const updateRef = useRef(updateProfile);
  updateRef.current = updateProfile;
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !window.electronAPI?.onGameActivity) return undefined;
    let last = null;
    const publish = (game) => {
      const name = getSettings().shareActivity && game?.name ? game.name : null;
      if (name === last) return;
      last = name;
      updateRef.current({ activity: name ? { name, since: Date.now() } : null }).catch(() => {});
    };
    const off = window.electronAPI.onGameActivity(publish);
    const onLogout = () => publish(null);
    window.addEventListener('concord:before-logout', onLogout);
    return () => {
      off();
      window.removeEventListener('concord:before-logout', onLogout);
    };
  }, [userId]);
}

function VerifyEmailBanner() {
  const { user, resendVerification } = useAuth();
  const { showToast, showError } = useNotification();
  const [hidden, setHidden] = useState(() => sessionStorage.getItem('concord_verify_hidden') === '1');
  if (!user?.isPasswordAccount || user.emailVerified || hidden) return null;
  return (
    <div className="app-banner" role="status">
      <span>Confirme seu e-mail <strong>{user.email}</strong> para proteger sua conta.</span>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => resendVerification().then(() => showToast('E-mail de verificação enviado.', 'success')).catch((err) => showError('Verificação', err.message))}
      >
        Reenviar e-mail
      </button>
      <button
        type="button"
        className="app-banner-close"
        aria-label="Fechar aviso"
        onClick={() => {
          sessionStorage.setItem('concord_verify_hidden', '1');
          setHidden(true);
        }}
      >
        ×
      </button>
    </div>
  );
}

function MainAppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { activeServer, activeChannel, joinByCode, serversLoaded, notice, openModal } = useServer();
  const { activeVoiceChannel } = useVoice();
  const { isScreenSharing, activePresenter } = useScreenShare();
  const { showToast, showSuccess, showError } = useNotification();
  const [showMemberList, setShowMemberList] = useState(true);
  useGlobalShortcuts();
  useEventReminders();
  useGameActivity();

  useEffect(() => {
    if (isAuthenticated) requestNotificationPermission().catch(() => {});
  }, [isAuthenticated]);

  // Keep the desktop shell (tray, startup, global push-to-talk) in sync.
  useEffect(() => {
    updateSettings({});
  }, []);

  // Desktop app opened through a concord:// or web invite link.
  useEffect(() => window.electronAPI?.onInviteLink?.((code) => sessionStorage.setItem('pending_invite_code', code)), []);

  useEffect(() => {
    const code = readInviteCodeFromUrl();
    if (code) sessionStorage.setItem('pending_invite_code', code.toUpperCase());
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !serversLoaded) return;
    const pending = sessionStorage.getItem('pending_invite_code');
    if (!pending) return;
    sessionStorage.removeItem('pending_invite_code');
    window.history.replaceState(null, '', window.location.pathname);
    joinByCode(pending)
      .then((res) => showSuccess('Convite aceito', res.message))
      .catch((err) => showError('Convite', err.message));
  }, [isAuthenticated, serversLoaded, joinByCode, showSuccess, showError]);

  // First login: walk the user through creating/joining a server.
  useEffect(() => {
    if (isAuthenticated && serversLoaded && user && !user.onboardingDone) openModal('onboarding');
  }, [isAuthenticated, serversLoaded, user?.onboardingDone, openModal, user]);

  useEffect(() => {
    if (notice?.type === 'removed') showToast('Você não faz mais parte de um dos servidores.', 'warning');
  }, [notice, showToast]);

  if (isLoading) {
    return (
      <div className="auth-page">
        <div style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>
          Iniciando Concord...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  const isVoiceView = activeChannel?.type === 'voice'
    || (!activeChannel && (activeVoiceChannel || isScreenSharing || activePresenter));

  return (
    <>
    <VerifyEmailBanner />
    <div className="main-layout">
      <ServerSidebar />
      {activeServer ? <ChannelSidebar /> : <DirectMessagesSidebar />}

      <ErrorBoundary>
        {activeServer ? (
          isVoiceView ? <VoiceRoomArea /> : <ChatArea onToggleMemberList={() => setShowMemberList(!showMemberList)} />
        ) : (
          <DirectChatArea />
        )}
      </ErrorBoundary>

      {activeServer && showMemberList && !isVoiceView && <MemberListSidebar />}

      <MiniStreamPlayer />
      <IncomingCallBanner />

      <ErrorBoundary>
        <CreateServerModal />
        <CreateChannelModal />
        <InviteModal />
        <PendingInvitesModal />
        <ScreenSharePickerModal />
        <SettingsModal />
        <ServerSettingsModal />
        <UpdateNotificationModal />
        <QuickSwitcher />
        <CreateGroupModal />
        <OnboardingModal />
      </ErrorBoundary>
    </div>
    </>
  );
}

installGlobalErrorHandlers();
window.electronAPI?.getAppVersion?.().then((v) => { window.__CONCORD_VERSION__ = v; }).catch(() => {});

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <ServerProvider>
          <DMProvider>
            <PresenceProvider>
              <UnreadProvider>
                <VoiceProvider>
                  <ScreenShareProvider>
                    <OverlayUIProvider>
                    <div className="app-container">
                      <TitleBar />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, minHeight: 0 }}>
                        <MainAppContent />
                      </div>
                    </div>
                    </OverlayUIProvider>
                  </ScreenShareProvider>
                </VoiceProvider>
              </UnreadProvider>
            </PresenceProvider>
          </DMProvider>
        </ServerProvider>
      </AuthProvider>
    </NotificationProvider>
  );
}
