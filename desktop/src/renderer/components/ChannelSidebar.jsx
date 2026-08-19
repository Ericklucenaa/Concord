import React, { useState } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { useScreenShare } from '../context/ScreenShareContext';
import { 
  Hash, 
  Volume2, 
  VolumeX,
  Plus, 
  ChevronDown, 
  UserPlus, 
  Settings, 
  LogOut, 
  Trash2,
  Image as ImageIcon,
  Mic, 
  MicOff, 
  Headphones, 
  Tv, 
  PhoneOff,
  Radio,
  Sliders,
  X
} from 'lucide-react';
import { CHANNEL_TYPES, ROLES, USER_STATUS } from '@shared/constants';

export default function ChannelSidebar() {
  const { 
    activeServer, 
    activeChannel, 
    setActiveChannel, 
    openModal,
    deleteServer,
    leaveServer 
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
    toggleDeafen,
    userVolumes,
    setUserVolume
  } = useVoice();
  const { 
    isScreenSharing, 
    setIsPickerOpen, 
    stopScreenShare, 
    activePresenter 
  } = useScreenShare();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedVoiceUser, setSelectedVoiceUser] = useState(null);

  if (!activeServer) {
    return (
      <aside className="channel-sidebar">
        <div className="server-header">
          <span className="server-header-title">Concord</span>
        </div>
        <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13, flex: 1 }}>
          Selecione ou crie um servidor à esquerda para começar a conversar.
        </div>

        {/* User Footer Bar (always available, even with no server yet) */}
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
                  onClick={() => { setIsMenuOpen(false); openModal('serverSettings'); }}
                >
                  <Settings size={16} style={{ color: 'var(--accent-primary)' }} />
                  Configurações do Servidor
                </button>
                <button 
                  className="dropdown-item btn-secondary" 
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
                  onClick={() => { setIsMenuOpen(false); openModal('serverSettings'); }}
                >
                  <ImageIcon size={16} style={{ color: 'var(--accent-primary)' }} />
                  Trocar Foto / Nome
                </button>
                <button 
                  className="dropdown-item btn-secondary" 
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
                  onClick={() => { setIsMenuOpen(false); openModal('invite'); }}
                >
                  <UserPlus size={16} style={{ color: 'var(--accent-success)' }} />
                  Convidar Pessoas (Link)
                </button>
                <button 
                  className="dropdown-item btn-secondary" 
                  style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
                  onClick={() => { setIsMenuOpen(false); openModal('createChannel'); }}
                >
                  <Plus size={16} />
                  Criar Canal
                </button>
                <div className="server-divider" style={{ width: '100%', margin: '4px 0' }} />
              </>
            )}
            
            {activeServer?.ownerId === user?.id || activeServer?.role === ROLES.OWNER || activeServer?.role === 'owner' ? (
              <button 
                className="dropdown-item btn-secondary" 
                style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--accent-danger)' }}
                onClick={() => { 
                  setIsMenuOpen(false); 
                  if (confirm(`Deseja realmente excluir o servidor "${activeServer.name}"?`)) {
                    deleteServer(activeServer.id);
                  }
                }}
              >
                <Trash2 size={16} />
                Excluir Servidor
              </button>
            ) : (
              <button 
                className="dropdown-item btn-secondary" 
                style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--accent-danger)' }}
                onClick={() => { 
                  setIsMenuOpen(false); 
                  if (confirm(`Deseja sair do servidor "${activeServer.name}"?`)) {
                    leaveServer(activeServer.id);
                  }
                }}
              >
                <LogOut size={16} />
                Sair do Servidor
              </button>
            )}

            <button 
              className="dropdown-item btn-secondary" 
              style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
              onClick={() => { setIsMenuOpen(false); openModal('settings'); }}
            >
              <Settings size={16} />
              Minhas Configurações
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
                      const currentVol = userVolumes?.get(u.userId) !== undefined ? userVolumes.get(u.userId) : 1;
                      const isUserLocallyMuted = currentVol === 0;

                      return (
                        <div 
                          key={u.userId} 
                          className={`voice-user-pill ${speaking ? 'speaking' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedVoiceUser(selectedVoiceUser?.userId === u.userId ? null : u);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 8px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: selectedVoiceUser?.userId === u.userId ? 'var(--bg-active)' : 'rgba(0, 0, 0, 0.2)',
                            margin: '2px 0',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease'
                          }}
                          title={`Clique para opções de áudio e perfil de @${u.username}`}
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
                            {isUserLocallyMuted && !isMe && (
                              <VolumeX size={12} style={{ color: 'var(--accent-danger)' }} title="Silenciado localmente" />
                            )}
                            {u.isScreenSharing && (
                              <span style={{ fontSize: 9, backgroundColor: 'var(--accent-danger)', padding: '1px 4px', borderRadius: 3, color: '#fff', fontWeight: 800 }}>LIVE</span>
                            )}
                            {muted && <MicOff size={13} style={{ color: 'var(--accent-danger)' }} title="Mutado" />}
                            {u.isDeafened && <Headphones size={13} style={{ color: 'var(--accent-danger)' }} title="Ensurdecido" />}
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

        {/* Discord-style Voice User Controls Modal/Popover */}
        {selectedVoiceUser && (
          <div 
            style={{
              margin: '8px 10px',
              padding: 12,
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img 
                  src={selectedVoiceUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedVoiceUser.username}`} 
                  alt="" 
                  style={{ width: 28, height: 28, borderRadius: 'var(--radius-full)', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedVoiceUser.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>@{selectedVoiceUser.username}</div>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setSelectedVoiceUser(null)}>
                <X size={14} />
              </button>
            </div>

            {selectedVoiceUser.userId !== user?.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Volume do Usuário</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {Math.round(((userVolumes?.get(selectedVoiceUser.userId) !== undefined ? userVolumes.get(selectedVoiceUser.userId) : 1) * 100))}%
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="2" 
                    step="0.05"
                    value={userVolumes?.get(selectedVoiceUser.userId) !== undefined ? userVolumes.get(selectedVoiceUser.userId) : 1}
                    onChange={(e) => setUserVolume(selectedVoiceUser.userId, parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button 
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '6px 8px', fontSize: 12, justifyContent: 'center' }}
                    onClick={() => {
                      const cur = userVolumes?.get(selectedVoiceUser.userId) !== undefined ? userVolumes.get(selectedVoiceUser.userId) : 1;
                      setUserVolume(selectedVoiceUser.userId, cur === 0 ? 1 : 0);
                    }}
                  >
                    {(userVolumes?.get(selectedVoiceUser.userId) === 0) ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    {(userVolumes?.get(selectedVoiceUser.userId) === 0) ? 'Desmutar' : 'Mutar Local'}
                  </button>

                  <button 
                    className="btn btn-secondary"
                    style={{ padding: '6px 8px', fontSize: 12 }}
                    onClick={() => setUserVolume(selectedVoiceUser.userId, 1)}
                    title="Redefinir volume para 100%"
                  >
                    100%
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>
                Este é o seu perfil de voz ativo.
              </div>
            )}
          </div>
        )}
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
