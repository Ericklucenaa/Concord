import React, { useState } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useScreenShare } from '../context/ScreenShareContext';
import { 
  Hash, 
  Volume2, 
  Plus, 
  ChevronDown, 
  UserPlus, 
  Settings, 
  LogOut, 
  Mic, 
  MicOff, 
  Headphones, 
  Tv, 
  PhoneOff,
  Radio,
  Sliders
} from 'lucide-react';
import { CHANNEL_TYPES, ROLES, USER_STATUS } from '@shared/constants';

export default function ChannelSidebar() {
  const { 
    activeServer, 
    activeChannel, 
    setActiveChannel, 
    openModal 
  } = useServer();
  const { user } = useAuth();
  const { 
    activeVoiceChannel, 
    voiceUsers, 
    voiceChannelUsersMap,
    joinVoice, 
    leaveVoice, 
    isMuted, 
    isDeafened, 
    isSpeaking,
    toggleMute, 
    toggleDeafen 
  } = useVoice();
  const { 
    isScreenSharing, 
    setIsPickerOpen, 
    stopScreenShare, 
    activePresenter 
  } = useScreenShare();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  if (!activeServer) {
    return (
      <aside className="channel-sidebar">
        <div className="server-header">
          <span className="server-header-title">Concord</span>
        </div>
        <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
          Selecione ou crie um servidor à esquerda para começar a conversar.
        </div>
      </aside>
    );
  }

  const isStaff = activeServer.role === ROLES.OWNER || activeServer.role === ROLES.ADMIN;
  const textChannels = activeServer.channels?.filter((c) => c.type === CHANNEL_TYPES.TEXT) || [];
  const voiceChannels = activeServer.channels?.filter((c) => c.type === CHANNEL_TYPES.VOICE) || [];

  return (
    <aside className="channel-sidebar">
      {/* Server Header Dropdown */}
      <div 
        className="server-header" 
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        style={{ position: 'relative' }}
      >
        <span className="server-header-title">{activeServer.name}</span>
        <ChevronDown size={18} style={{ transform: isMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />

        {isMenuOpen && (
          <div 
            className="dropdown-menu"
            style={{
              position: 'absolute',
              top: '50px',
              left: '8px',
              right: '8px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid var(--border-color)',
              padding: '6px',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isStaff && (
              <>
                <button 
                  className="dropdown-item btn-secondary" 
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
                  onClick={() => { setIsMenuOpen(false); openModal('invite'); }}
                >
                  <UserPlus size={16} style={{ color: 'var(--accent-primary)' }} />
                  Convidar Pessoas
                </button>
                <button 
                  className="dropdown-item btn-secondary" 
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
                  onClick={() => { setIsMenuOpen(false); openModal('createChannel'); }}
                >
                  <Plus size={16} />
                  Criar Canal
                </button>
              </>
            )}
            <button 
              className="dropdown-item btn-secondary" 
              style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
              onClick={() => { setIsMenuOpen(false); openModal('settings'); }}
            >
              <Settings size={16} />
              Configurações
            </button>
          </div>
        )}
      </div>

      {/* Channels List */}
      <div className="channel-list">
        {/* Text Channels Category */}
        <div className="channel-category">
          <div className="channel-category-header">
            <span>Canais de Texto</span>
            {isStaff && (
              <button 
                className="add-channel-btn" 
                title="Criar Canal de Texto"
                onClick={() => openModal('createChannel')}
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          {textChannels.map((channel) => {
            const isActive = activeChannel?.id === channel.id;
            return (
              <div
                key={channel.id}
                className={`channel-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveChannel(channel)}
              >
                <Hash className="channel-icon" />
                <span>{channel.name}</span>
              </div>
            );
          })}
        </div>

        {/* Voice Channels Category */}
        <div className="channel-category">
          <div className="channel-category-header">
            <span>Canais de Voz</span>
            {isStaff && (
              <button 
                className="add-channel-btn" 
                title="Criar Canal de Voz"
                onClick={() => openModal('createChannel')}
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          {voiceChannels.map((channel) => {
            const isConnectedToThis = activeVoiceChannel?.id === channel.id;
            const currentUsersInChannel = isConnectedToThis 
              ? voiceUsers 
              : (voiceChannelUsersMap.get(channel.id) || []);

            return (
              <div key={channel.id} style={{ marginBottom: 4 }}>
                <div
                  className={`channel-item ${isConnectedToThis ? 'active' : ''}`}
                  onClick={() => {
                    if (!isConnectedToThis) {
                      joinVoice(channel);
                    }
                    setActiveChannel(channel);
                  }}
                  style={{ justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <Volume2 
                      className="channel-icon" 
                      style={{ color: isConnectedToThis || currentUsersInChannel.length > 0 ? 'var(--accent-success)' : undefined }} 
                    />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {channel.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button 
                      className="icon-btn" 
                      style={{ padding: 2, opacity: 0.6 }}
                      title="Convidar para este canal"
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal('invite');
                      }}
                    >
                      <UserPlus size={13} />
                    </button>
                  </div>
                </div>

                {/* Users in Voice Channel (Discord style) */}
                {currentUsersInChannel.length > 0 && (
                  <div className="voice-users-list" style={{ paddingLeft: 20, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {currentUsersInChannel.map((u) => {
                      const isMe = u.userId === user?.id;
                      const speaking = isMe ? isSpeaking : u.isSpeaking;
                      const muted = isMe ? isMuted : u.isMuted;
                      const deafened = isMe ? isDeafened : u.isDeafened;

                      return (
                        <div 
                          key={u.userId} 
                          className={`voice-user-pill ${speaking ? 'speaking' : ''}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            margin: '1px 0'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                            <div style={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
                              <img 
                                src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`} 
                                alt="" 
                                style={{ 
                                  width: 22, 
                                  height: 22, 
                                  borderRadius: 'var(--radius-full)', 
                                  objectFit: 'cover',
                                  border: speaking ? '2px solid var(--accent-success)' : '1px solid transparent',
                                  boxShadow: speaking ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
                                  transition: 'all 0.15s ease'
                                }} 
                              />
                            </div>
                            <span style={{ 
                              fontSize: 13, 
                              fontWeight: 600, 
                              color: isMe ? 'var(--text-primary)' : 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {u.username} {isMe ? '(Você)' : ''}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {u.isScreenSharing && (
                              <span style={{ fontSize: 9, backgroundColor: 'var(--accent-danger)', padding: '1px 4px', borderRadius: 3, color: '#fff', fontWeight: 800 }}>LIVE</span>
                            )}
                            {muted && <MicOff size={13} style={{ color: 'var(--accent-danger)' }} title="Mutado" />}
                            {deafened && <Headphones size={13} style={{ color: 'var(--accent-danger)' }} title="Ensurdecido" />}
                          </div>
                        </div>
                      );
                    })}

                    {/* Discord style "Convidar para voz" button */}
                    {isConnectedToThis && (
                      <button
                        onClick={() => openModal('invite')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 8px',
                          marginTop: 2,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'left',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <UserPlus size={14} style={{ opacity: 0.8 }} />
                        <span>Convidar para voz</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Voice Connection Bar */}
      {activeVoiceChannel && (
        <div className="active-voice-bar">
          <div className="active-voice-header">
            <div className="voice-status-info">
              <div className="voice-ping-dot" />
              <span className="voice-channel-name">{activeVoiceChannel.name}</span>
            </div>
            <button 
              className="icon-btn" 
              onClick={leaveVoice} 
              title="Desconectar da Voz"
              style={{ color: 'var(--accent-danger)' }}
            >
              <PhoneOff size={16} />
            </button>
          </div>

          <div className="voice-action-btns">
            <button 
              className={`voice-action-btn ${isScreenSharing ? 'active' : ''}`}
              onClick={() => {
                if (isScreenSharing) {
                  stopScreenShare();
                } else {
                  setIsPickerOpen(true);
                }
              }}
              title={isScreenSharing ? 'Parar Transmissão' : 'Transmitir Tela'}
            >
              <Tv size={14} />
              <span>{isScreenSharing ? 'Parar' : 'Transmitir'}</span>
            </button>

            <button 
              className={`voice-action-btn ${isMuted ? 'danger' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            <button 
              className={`voice-action-btn ${isDeafened ? 'danger' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? 'Reativar Áudio' : 'Desativar Áudio'}
            >
              <Headphones size={14} />
            </button>
          </div>
        </div>
      )}

      {/* User Footer Bar */}
      <footer className="user-footer-bar">
        <div 
          className="user-profile-summary"
          onClick={() => openModal('settings')}
          title="Abrir Configurações do Usuário"
        >
          <div className="avatar-wrapper">
            <img 
              src={user?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.username}`} 
              alt={user?.username} 
              className="avatar-img" 
            />
            <div className={`status-dot ${user?.status || 'online'}`} />
          </div>
          <div className="user-names">
            <span className="user-username">{user?.username}</span>
            <span className="user-tag">#{user?.id ? user.id.substring(0, 4) : '0000'}</span>
          </div>
        </div>

        <div className="user-controls">
          <button 
            className={`icon-btn ${isMuted ? 'active' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Desmutar' : 'Mutar'}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button 
            className={`icon-btn ${isDeafened ? 'active' : ''}`}
            onClick={toggleDeafen}
            title={isDeafened ? 'Desensurdecer' : 'Ensurdecer'}
          >
            <Headphones size={18} />
          </button>
          <button 
            className="icon-btn"
            onClick={() => openModal('settings')}
            title="Configurações"
          >
            <Settings size={18} />
          </button>
        </div>
      </footer>
    </aside>
  );
}
