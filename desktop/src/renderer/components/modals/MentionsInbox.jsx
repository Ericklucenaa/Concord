import React from 'react';
import { AtSign, X, CheckCheck, Hash } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useUnread } from '../../context/UnreadContext';
import { markMentionsRead } from '../../services/cloud/messages';
import { quietly } from '../../services/log';

function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short' });
}

/** "@" inbox: recent mentions across all servers. */
export default function MentionsInbox({ onClose }) {
  const { servers, goToChannel } = useServer();
  const { mentions, unreadMentions } = useUnread();

  const open = (m) => {
    goToChannel(m.serverId, m.channelId);
    if (!m.read) quietly('mention read', markMentionsRead([m]));
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><AtSign size={18} /> Menções</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {unreadMentions.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => quietly('mentions read', markMentionsRead(unreadMentions))}>
                <CheckCheck size={14} /> Marcar todas como lidas
              </button>
            )}
            <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
          </div>
        </div>
        <div className="modal-body" style={{ maxHeight: 520 }}>
          {mentions.length === 0 && <div className="side-empty">Quando alguém mencionar você com @, aparece aqui.</div>}
          {mentions.map((m) => {
            const server = servers.find((s) => s.id === m.serverId);
            const channel = server?.channels.find((c) => c.id === m.channelId);
            return (
              <button key={m.docId} className={`mention-row ${m.read ? '' : 'unread'}`} onClick={() => open(m)}>
                <div className="mention-row-meta">
                  <strong>@{m.authorName}</strong>
                  <span><Hash size={11} />{channel?.name || 'canal'} · {server?.name || 'servidor'}</span>
                  <span className="mention-row-time">{ago(m.createdAt)}</span>
                </div>
                <div className="mention-row-text">{m.preview || '(sem texto)'}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
