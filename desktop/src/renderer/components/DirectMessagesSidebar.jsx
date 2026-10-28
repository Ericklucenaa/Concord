import React from 'react';
import { Users, Plus, Radio, UsersRound, MessageSquare, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDM } from '../context/DMContext';
import { useServer } from '../context/ServerContext';
import { usePresence } from '../context/PresenceContext';
import { useUnread } from '../context/UnreadContext';
import { describeThread } from '../services/cloud/dms';
import { defaultAvatar } from '../services/cloud/util';
import UserFooter from './UserFooter';
import { useOverlayUI } from '../context/OverlayUIContext';
import { useUserMenu } from './useUserMenu';

export default function DirectMessagesSidebar() {
  const { openMenu } = useOverlayUI();
  const openUserMenu = useUserMenu();
  const { user } = useAuth();
  const { threads, activeThreadId, openThread, closeDM, incomingRequests, setActiveTab, blockedIds } = useDM();
  const { openModal } = useServer();
  const { getStatus, profiles } = usePresence();
  const { isThreadUnread } = useUnread();

  const visible = threads.filter((t) => t.isGroup || t.lastMessageAt || t.id === activeThreadId);

  return (
    <aside className="channel-sidebar">
      <div className="server-header" style={{ cursor: 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={18} style={{ color: 'var(--accent-primary)' }} />
          <span className="server-header-title" style={{ fontSize: 14 }}>Início</span>
        </div>
      </div>

      <div className="channels-list">
        <div className={`channel-item ${!activeThreadId ? 'active' : ''}`} onClick={closeDM}>
          <div className="channel-item-main">
            <Users size={18} className="channel-icon" />
            <span style={{ fontWeight: 600 }}>Amigos</span>
          </div>
          {incomingRequests.length > 0 && <span className="badge-counter inline">{incomingRequests.length}</span>}
        </div>

        <div className="channel-category-header" style={{ marginTop: 14 }}>
          <span>Mensagens diretas</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="add-channel-btn" title="Novo grupo" onClick={() => openModal('createGroup')}>
              <UsersRound size={14} />
            </button>
            <button className="add-channel-btn" title="Nova conversa" onClick={() => { closeDM(); setActiveTab('all'); }}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        {visible.length === 0 && (
          <div className="sidebar-hint">
            Nenhuma conversa ainda. Abra a lista de amigos e clique em <strong>Mensagem</strong>.
          </div>
        )}

        {visible.map((thread) => {
          const info = describeThread(thread, user.id, profiles);
          const unread = isThreadUnread(thread) && !blockedIds.includes(thread.lastMessageBy);
          const status = thread.isGroup ? null : getStatus(info.other?.id);
          return (
            <div
              key={thread.id}
              className={`channel-item dm-item ${thread.id === activeThreadId ? 'active' : ''} ${unread ? 'unread' : ''}`}
              onClick={() => openThread(thread.id)}
              onContextMenu={(e) => {
                if (!thread.isGroup && info.other?.id) {
                  openUserMenu(e, { id: info.other.id, username: info.title, avatar: info.avatar });
                } else {
                  openMenu(e, [
                    { label: 'Abrir conversa', icon: MessageSquare, onClick: () => openThread(thread.id) },
                    { label: 'Copiar ID do grupo', icon: Copy, onClick: () => navigator.clipboard.writeText(thread.id) }
                  ], info.title);
                }
              }}
            >
              <div className="channel-item-main">
                {thread.isGroup ? (
                  <div className="group-avatar small"><Users size={13} /></div>
                ) : (
                  <div className="avatar-wrapper" style={{ width: 28, height: 28 }}>
                    <img src={info.avatar || defaultAvatar(info.title)} alt="" className="avatar-img" style={{ width: 28, height: 28 }} />
                    <div className={`status-dot ${status}`} />
                  </div>
                )}
                <div className="dm-item-text">
                  <span className="dm-item-title">{info.title}</span>
                  {thread.isGroup
                    ? <span className="dm-item-sub">{thread.participants.length} membros</span>
                    : thread.lastPreview && <span className="dm-item-sub">{thread.lastPreview}</span>}
                </div>
              </div>
              {unread && <span className="unread-dot" />}
            </div>
          );
        })}
      </div>

      <UserFooter />
    </aside>
  );
}
