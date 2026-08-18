import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ServerProvider, useServer } from './context/ServerContext';
import { VoiceProvider, useVoice } from './context/VoiceContext';
import { ScreenShareProvider } from './context/ScreenShareContext';

import TitleBar from './components/TitleBar';
import ServerSidebar from './components/ServerSidebar';
import ChannelSidebar from './components/ChannelSidebar';
import ChatArea from './components/ChatArea';
import VoiceRoomArea from './components/VoiceRoomArea';
import MemberListSidebar from './components/MemberListSidebar';

import CreateServerModal from './components/modals/CreateServerModal';
import CreateChannelModal from './components/modals/CreateChannelModal';
import InviteModal from './components/modals/InviteModal';
import PendingInvitesModal from './components/modals/PendingInvitesModal';
import ScreenSharePickerModal from './components/modals/ScreenSharePickerModal';
import SettingsModal from './components/modals/SettingsModal';
import ServerSettingsModal from './components/modals/ServerSettingsModal';

import AuthPage from './pages/AuthPage';
import { CHANNEL_TYPES } from '@shared/constants';

function MainAppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const { activeChannel, joinByCode } = useServer();
  const { activeVoiceChannel } = useVoice();
  const [showMemberList, setShowMemberList] = useState(true);

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

  // Display Voice Room view if currently viewing a voice channel or connected to voice
  const isVoiceView = activeChannel?.type === CHANNEL_TYPES.VOICE;

  return (
    <div className="main-layout">
      {/* 1. Server Sidebar */}
      <ServerSidebar />

      {/* 2. Channel Sidebar & User Footer */}
      <ChannelSidebar />

      {/* 3. Center Workspace: Text Chat or Voice Room / Screen Share */}
      {isVoiceView ? (
        <VoiceRoomArea />
      ) : (
        <ChatArea onToggleMemberList={() => setShowMemberList(!showMemberList)} />
      )}

      {/* 4. Right Sidebar: Server Members */}
      {showMemberList && <MemberListSidebar />}

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
    <AuthProvider>
      <SocketProvider>
        <ServerProvider>
          <VoiceProvider>
            <ScreenShareProvider>
              <div className="app-container">
                <TitleBar />
                <MainAppContent />
              </div>
            </ScreenShareProvider>
          </VoiceProvider>
        </ServerProvider>
      </SocketProvider>
    </AuthProvider>
  );
}
