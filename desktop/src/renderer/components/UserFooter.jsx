import React from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, Settings, Radio } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useServer } from '../context/ServerContext';
import { useVoice } from '../context/VoiceContext';
import { usePresence } from '../context/PresenceContext';
import { defaultAvatar } from '../services/cloud/util';
import { useUserMenu } from './useUserMenu';

export default function UserFooter() {
  const { user } = useAuth();
  const { openModal } = useServer();
  const { isMuted, isDeafened, toggleMute, toggleDeafen, voiceMode, isPttPressed, activeVoiceChannel } = useVoice();
  const { getStatus, getCustomStatus } = usePresence();
  const custom = getCustomStatus(user?.id);
  const openUserMenu = useUserMenu();

  return (
    <footer className="user-footer-bar">
      <div
        className="user-profile-summary"
        onClick={() => openModal('settings')}
        onContextMenu={(e) => openUserMenu(e, { id: user.id, username: user.username, avatar: user.avatar })}
        title="Configurações do usuário · botão direito para mais opções"
      >
        <div className="avatar-wrapper">
          <img src={user?.avatar || defaultAvatar(user?.username)} alt={user?.username} className="avatar-img" />
          <div className={`status-dot ${getStatus(user?.id)}`} />
        </div>
        <div className="user-names">
          <span className="user-username">{user?.username}</span>
          <span className="user-tag">
            {custom ? `${custom.emoji || ''} ${custom.text || ''}`.trim() : `#${user?.userTag || '0000'}`}
          </span>
        </div>
      </div>

      <div className="user-controls">
        {activeVoiceChannel && voiceMode === 'ptt' && (
          <span className={`ptt-indicator ${isPttPressed ? 'on' : ''}`} title="Aperte para falar">
            <Radio size={14} />
          </span>
        )}
        <button className={`icon-btn ${isMuted ? 'active danger' : ''}`} onClick={toggleMute} title={isMuted ? 'Ativar microfone' : 'Silenciar microfone'}>
          {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button className={`icon-btn ${isDeafened ? 'active danger' : ''}`} onClick={toggleDeafen} title={isDeafened ? 'Ativar áudio' : 'Desativar áudio'}>
          {isDeafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
        </button>
        <button className="icon-btn" onClick={() => openModal('settings')} title="Configurações">
          <Settings size={18} />
        </button>
      </div>
    </footer>
  );
}
