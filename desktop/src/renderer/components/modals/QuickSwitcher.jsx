import React, { useEffect, useMemo, useState } from 'react';
import { Hash, Volume2, Users, AtSign, Search } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useDM } from '../../context/DMContext';
import { useAuth } from '../../context/AuthContext';
import { usePresence } from '../../context/PresenceContext';
import { useUnread } from '../../context/UnreadContext';
import { useVoice } from '../../context/VoiceContext';
import { describeThread } from '../../services/cloud/dms';
import { canViewChannel } from '../../services/permissions';

/** Ctrl+K: jump to any channel, conversation or friend. */
export default function QuickSwitcher() {
  const { modalState, closeModal, servers, goToChannel, setActiveServer } = useServer();
  const { threads, openThread, friendList, openDMWithUser } = useDM();
  const { user } = useAuth();
  const { profiles } = usePresence();
  const { isChannelUnread, isThreadUnread } = useUnread();
  const { joinVoice } = useVoice();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const open = modalState.quickSwitcher;

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const items = useMemo(() => {
    if (!open || !user) return [];
    const list = [];
    servers.forEach((server) => {
      server.channels.forEach((c) => {
        if (!canViewChannel(server, user.id, c.id)) return;
        list.push({
          key: `c-${c.id}`,
          kind: c.type,
          label: c.name,
          sub: server.name,
          unread: c.type === 'text' && isChannelUnread(c.id),
          run: () => {
            goToChannel(server.id, c.id);
            if (c.type === 'voice') joinVoice({ ...c, serverId: server.id });
          }
        });
      });
    });
    threads.forEach((t) => {
      const info = describeThread(t, user.id, profiles);
      list.push({
        key: `t-${t.id}`,
        kind: t.isGroup ? 'group' : 'dm',
        label: info.title,
        sub: t.isGroup ? 'Grupo' : 'Mensagem direta',
        unread: isThreadUnread(t),
        run: () => {
          setActiveServer(null);
          openThread(t.id);
        }
      });
    });
    friendList.forEach((f) => {
      if (threads.some((t) => !t.isGroup && t.participants.includes(f.id))) return;
      list.push({
        key: `f-${f.id}`,
        kind: 'dm',
        label: f.username,
        sub: 'Amigo — iniciar conversa',
        run: () => {
          setActiveServer(null);
          openDMWithUser(f);
        }
      });
    });
    return list;
  }, [open, servers, threads, friendList, profiles, user, isChannelUnread, isThreadUnread, goToChannel, joinVoice, openThread, openDMWithUser, setActiveServer]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^[#@]/, '');
    const matches = q
      ? items.filter((i) => i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q))
      : items.filter((i) => i.unread).concat(items.filter((i) => !i.unread));
    return matches.slice(0, 12);
  }, [items, query]);

  if (!open) return null;

  const choose = (item) => {
    if (!item) return;
    closeModal('quickSwitcher');
    item.run();
  };

  const icon = (kind) => {
    if (kind === 'voice') return <Volume2 size={16} />;
    if (kind === 'group') return <Users size={16} />;
    if (kind === 'dm') return <AtSign size={16} />;
    return <Hash size={16} />;
  };

  return (
    <div className="modal-backdrop" onClick={() => closeModal('quickSwitcher')}>
      <div className="modal-container quick-switcher" onClick={(e) => e.stopPropagation()}>
        <div className="quick-switcher-input">
          <Search size={18} />
          <input
            autoFocus
            placeholder="Para onde você quer ir?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                choose(filtered[index]);
              } else if (e.key === 'Escape') {
                closeModal('quickSwitcher');
              }
            }}
          />
        </div>
        <div className="quick-switcher-list">
          {filtered.length === 0 && <div className="side-empty">Nada encontrado.</div>}
          {filtered.map((item, i) => (
            <button
              key={item.key}
              className={`quick-switcher-item ${i === index ? 'active' : ''} ${item.unread ? 'unread' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(item)}
            >
              {icon(item.kind)}
              <span className="qs-label">{item.label}</span>
              <span className="qs-sub">{item.sub}</span>
            </button>
          ))}
        </div>
        <div className="quick-switcher-hint">↑↓ navegar • Enter abrir • Esc fechar</div>
      </div>
    </div>
  );
}
