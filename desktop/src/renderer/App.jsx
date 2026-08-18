import React, { useState } from 'react';
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
  const { activeChannel } = useServer();
  const { activeVoiceChannel } = useVoice();
  const [showMemberList, setShowMemberList] = useState(true);

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
