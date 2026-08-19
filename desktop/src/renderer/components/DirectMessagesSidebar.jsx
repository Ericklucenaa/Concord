import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useDM } from '../context/DMContext';
import { useVoice } from '../context/VoiceContext';
import { useServer } from '../context/ServerContext';
import { 
  Users, 
  MessageSquare, 
  UserPlus, 
  Plus, 
  Mic, 
  MicOff, 
  Headphones, 
  Settings, 
  X,
  Radio,
  Clock
} from 'lucide-react';

export default function DirectMessagesSidebar() {
  const { user } = useAuth();
  const { activeDM, openDMWithUser, setActiveDM, friendsList, activeTab, setActiveTab } = useDM();
  const { isMuted, isDeafened, toggleMute, toggleDeafen } = useVoice();
  const { openModal } = useServer();

  // Friends filtering
  const acceptedFriends = friendsList.filter((f) => f.status === 'accepted').map((f) => {
    const isSender = String(f.senderId) === String(user?.id);
    return {
      friendshipId: f.id,
      id: isSender ? f.receiverId : f.senderId,
      username: isSender ? f.receiverUsername : f.senderUsername,
      avatar: isSender ? f.receiverAvatar : f.senderAvatar,
      status: 'online'
    };
  });

  const pendingCount = friendsList.filter((f) => f.status === 'pending' && f.receiverNickname === user?.username?.toLowerCase()).length;

  return (
    <aside className="channel-sidebar">
      {/* Header Search / Home */}
      <div className="server-header" style={{ cursor: 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={18} style={{ color: 'var(--accent-primary)' }} />
          <span className="server-header-title" style={{ fontSize: 14 }}>Início / Amigos</span>
        </div>
      </div>

      <div className="channel-list">
        {/* Friends Navigation Button */}
        <div
          className={`channel-item ${!activeDM ? 'active' : ''}`}
          onClick={() => setActiveDM(null)}
          style={{ justifyContent: 'space-between', marginBottom: 6 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={18} className="channel-icon" />
            <span style={{ fontWeight: 600 }}>Amigos</span>
          </div>
          {pendingCount > 0 && (
            <span className="badge-counter" style={{ position: 'static', padding: '2px 6px' }}>
              {pendingCount}
            </span>
          )}
        </div>

        {/* DM Category Header */}
        <div className="channel-category-header" style={{ marginTop: 12 }}>
          <span>Mensagens Diretas</span>
          <button 
            className="add-channel-btn" 
            title="Adicionar Amigo / Nova Conversa"
            onClick={() => { setActiveDM(null); setActiveTab('add'); }}
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Direct Message Conversations List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {acceptedFriends.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 8px', textAlign: 'center', lineHeight: 1.4 }}>
              Nenhuma conversa aberta ainda.<br />
              <span 
                style={{ color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
                onClick={() => { setActiveDM(null); setActiveTab('add'); }}
              >
                Adicione um amigo
              </span> para começar!
            </div>
          ) : (
            acceptedFriends.map((friend) => {
              const isActive = activeDM?.id === friend.id || (activeDM?.username && activeDM.username === friend.username);
              return (
                <div
                  key={friend.id || friend.username}
                  className={`channel-item ${isActive ? 'active' : ''}`}
                  onClick={() => openDMWithUser(friend)}
                  style={{ justifyContent: 'space-between', padding: '6px 8px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <div style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
                      <img 
                        src={friend.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${friend.username}`} 
                        alt="" 
                        style={{ width: 26, height: 26, borderRadius: 'var(--radius-full)', objectFit: 'cover' }}
                      />
                      <div className="status-dot online" style={{ width: 8, height: 8, bottom: -1, right: -1, border: '2px solid var(--bg-secondary)' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {friend.username}
                    </span>
                  </div>

                  <button 
                    className="icon-btn hover-danger"
                    style={{ padding: 2, opacity: 0.5 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeDM?.id === friend.id) setActiveDM(null);
                    }}
                    title="Fechar conversa"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

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
