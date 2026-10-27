import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Hash, Users, Search, Pin, Lock, Megaphone } from 'lucide-react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { useDM } from '../context/DMContext';
import { usePresence } from '../context/PresenceContext';
import ChatView from './chat/ChatView';
import { PinnedPanel, SearchPanel } from './chat/SidePanels';
import { canPostInChannel, isChannelReadOnly, isModerator, channelAllowedRoles } from '../services/permissions';

export default function ChatArea({ onToggleMemberList }) {
  const { activeServer, activeChannel, visibleChannels, joinByCode, setActiveChannel } = useServer();
  const { user } = useAuth();
  const { blockedIds } = useDM();
  const { getProfile } = usePresence();
  const [panel, setPanel] = useState(null); // 'search' | 'pinned' | null
  const chatRef = useRef(null);
  const pendingJump = useRef(null);

  // Ctrl+F opens search for the current channel.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setPanel('search');
      }
      if (e.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const members = useMemo(
    () => (activeServer?.memberIds || []).map((id) => {
      const p = getProfile(id);
      return { id, username: p?.username || '', avatar: p?.avatar || '' };
    }).filter((m) => m.username),
    [activeServer?.memberIds, getProfile]
  );

  const textChannels = visibleChannels.filter((c) => c.type === 'text');
  const searchScopes = useMemo(() => {
    if (!activeServer || !activeChannel) return null;
    return {
      current: [{ type: 'channel', serverId: activeServer.id, channelId: activeChannel.id }],
      all: textChannels.map((c) => ({ type: 'channel', serverId: activeServer.id, channelId: c.id }))
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServer?.id, activeChannel?.id, textChannels.map((c) => c.id).join(',')]);

  // Jump after switching channels from a search result.
  useEffect(() => {
    if (pendingJump.current) {
      const id = pendingJump.current;
      pendingJump.current = null;
      setTimeout(() => chatRef.current?.jumpTo(id), 600);
    }
  }, [activeChannel?.id]);

  if (!activeServer || !activeChannel) {
    return (
      <main className="chat-area">
        <div className="empty-state">
          <Hash size={40} />
          <h3>Nenhum canal de texto disponível</h3>
          <p>Peça a um administrador para criar um canal ou dar acesso a você.</p>
        </div>
      </main>
    );
  }

  const scope = { type: 'channel', serverId: activeServer.id, channelId: activeChannel.id };
  const readOnly = isChannelReadOnly(activeServer, activeChannel.id);
  const restricted = Boolean(channelAllowedRoles(activeServer, activeChannel.id));
  const canPost = canPostInChannel(activeServer, user.id, activeChannel.id);
  const isMod = isModerator(activeServer, user.id);
  const channelNames = Object.fromEntries(textChannels.map((c) => [c.id, c.name]));

  const jump = (message) => {
    const target = message.scope?.channelId || message.channelId;
    if (target && target !== activeChannel.id) {
      pendingJump.current = message.id;
      setActiveChannel(textChannels.find((c) => c.id === target));
    } else {
      chatRef.current?.jumpTo(message.id);
    }
  };

  return (
    <main className="chat-area">
      <header className="chat-header">
        <div className="chat-header-info">
          {readOnly ? <Megaphone size={20} className="muted-icon" /> : <Hash size={20} className="muted-icon" />}
          <span className="chat-header-title">{activeChannel.name}</span>
          {restricted && <Lock size={13} className="muted-icon" title="Canal restrito a alguns cargos" />}
          <span className="chat-header-desc">
            {readOnly ? 'Canal de avisos — apenas moderadores publicam' : `Canal de texto de ${activeServer.name}`}
          </span>
        </div>
        <div className="chat-header-actions">
          <button className={`icon-btn ${panel === 'pinned' ? 'active' : ''}`} onClick={() => setPanel(panel === 'pinned' ? null : 'pinned')} title="Mensagens fixadas">
            <Pin size={18} />
          </button>
          <button className={`icon-btn ${panel === 'search' ? 'active' : ''}`} onClick={() => setPanel(panel === 'search' ? null : 'search')} title="Pesquisar (Ctrl + F)">
            <Search size={18} />
          </button>
          <button className="icon-btn" onClick={onToggleMemberList} title="Lista de membros">
            <Users size={20} />
          </button>
        </div>
      </header>

      <div className="chat-body">
        <ChatView
          ref={chatRef}
          scope={scope}
          attachmentScope={{ scopeType: 'server', scopeId: activeServer.id }}
          members={members}
          canModerate={isMod}
          canPin={isMod}
          allowEveryone={isMod}
          blockedIds={blockedIds}
          disabledReason={canPost ? null : 'Este é um canal de avisos: apenas moderadores podem enviar mensagens.'}
          placeholder={`Conversar em #${activeChannel.name}`}
          onJoinInvite={joinByCode}
          emptyState={(
            <div className="channel-welcome">
              <div className="channel-welcome-icon"><Hash size={32} /></div>
              <h2>Bem-vindo a #{activeChannel.name}!</h2>
              <p>Este é o começo do canal. Envie mensagens, arquivos e emojis.</p>
            </div>
          )}
        />
        {panel === 'pinned' && <PinnedPanel scope={scope} onJump={jump} onClose={() => setPanel(null)} />}
        {panel === 'search' && searchScopes && (
          <SearchPanel scopes={searchScopes} channelNames={channelNames} onJump={jump} onClose={() => setPanel(null)} />
        )}
      </div>
    </main>
  );
}
