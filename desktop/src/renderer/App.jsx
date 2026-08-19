import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ServerProvider, useServer } from './context/ServerContext';
import { VoiceProvider, useVoice } from './context/VoiceContext';
import { ScreenShareProvider } from './context/ScreenShareContext';
import { NotificationProvider } from './context/NotificationContext';
import { DMProvider } from './context/DMContext';

import TitleBar from './components/TitleBar';
import ServerSidebar from './components/ServerSidebar';
import ChannelSidebar from './components/ChannelSidebar';
import DirectMessagesSidebar from './components/DirectMessagesSidebar';
import ChatArea from './components/ChatArea';
import DirectChatArea from './components/DirectChatArea';
import VoiceRoomArea from './components/VoiceRoomArea';
import MemberListSidebar from './components/MemberListSidebar';
import MiniStreamPlayer from './components/MiniStreamPlayer';
import { requestNotificationPermission } from './services/notificationService';

import CreateServerModal from './components/modals/CreateServerModal';
import CreateChannelModal from './components/modals/CreateChannelModal';
import InviteModal from './components/modals/InviteModal';
import PendingInvitesModal from './components/modals/PendingInvitesModal';
import ScreenSharePickerModal from './components/modals/ScreenSharePickerModal';
import SettingsModal from './components/modals/SettingsModal';
import ServerSettingsModal from './components/modals/ServerSettingsModal';

import AuthPage from './pages/AuthPage';
import { useScreenShare } from './context/ScreenShareContext';

function MainAppContent() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { activeServer, activeChannel, joinByCode } = useServer();
  const { activeVoiceChannel } = useVoice();
  const { isScreenSharing, activePresenter } = useScreenShare();
  const [showMemberList, setShowMemberList] = useState(true);

  // Request native push notification permission
  useEffect(() => {
    if (isAuthenticated) {
      requestNotificationPermission().catch(() => {});
    }
  }, [isAuthenticated]);

  // Capture invite code from URL on load (even if unauthenticated)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    const search = window.location.search;
    let inviteCode = null;

    if (hash && hash.includes('invite=')) {
      const match = hash.match(/invite=([a-zA-Z0-9]+)/);
      if (match) inviteCode = match[1];
    } else if (search && search.includes('invite=')) {
      const params = new URLSearchParams(search);
      inviteCode = params.get('invite');
    }

    if (inviteCode) {
      sessionStorage.setItem('pending_invite_code', inviteCode.toUpperCase());
    }
  }, []);

  // Auto-join server from pending invite code once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkPendingInvite = async () => {
      const pendingCode = sessionStorage.getItem('pending_invite_code');
      if (pendingCode) {
        try {
          await joinByCode(pendingCode);
          sessionStorage.removeItem('pending_invite_code');
          // Clear query/hash from browser URL to clean up the navigation history
          window.history.replaceState(null, '', window.location.pathname);
        } catch (err) {
          console.warn('Auto-join by stored invite link error:', err);
        }
      }
    };

    checkPendingInvite();
  }, [isAuthenticated, joinByCode]);

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

  // Display Voice Room view if active channel is voice or if user is on the voice view
  const isVoiceView = activeChannel?.type === 'voice' || (!activeChannel && (activeVoiceChannel || isScreenSharing || activePresenter));

  return (
    <div className="main-layout">
      {/* 1. Server Sidebar */}
      <ServerSidebar />

      {/* 2. Channel Sidebar or DM Sidebar */}
      {activeServer ? <ChannelSidebar /> : <DirectMessagesSidebar />}

      {/* 3. Center Workspace */}
      {activeServer ? (
        isVoiceView ? (
          <VoiceRoomArea />
        ) : (
          <ChatArea onToggleMemberList={() => setShowMemberList(!showMemberList)} />
        )
      ) : (
        <DirectChatArea />
      )}

      {/* 4. Right Sidebar: Server Members (only in server view) */}
      {activeServer && showMemberList && <MemberListSidebar />}

      {/* Floating Mini Stream Player */}
      <MiniStreamPlayer />

      {/* Modals */}
      <CreateServerModal />
      <CreateChannelModal />
      <InviteModal />
      <PendingInvitesModal />
      <ScreenSharePickerModal />
      <SettingsModal />
      <ServerSettingsModal />
    </div>
  );
}

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <SocketProvider>
          <ServerProvider>
            <DMProvider>
              <VoiceProvider>
                <ScreenShareProvider>
                  <div className="app-container">
                    <TitleBar />
                    <MainAppContent />
                  </div>
                </ScreenShareProvider>
              </VoiceProvider>
            </DMProvider>
          </ServerProvider>
        </SocketProvider>
      </AuthProvider>
    </NotificationProvider>
  );
}
