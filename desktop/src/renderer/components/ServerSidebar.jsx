import React, { useState } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import {
  Radio,
  Plus,
  Mail,
  Settings,
  UserPlus,
  Trash2,
  LogOut,
  FolderPlus,
  AtSign,
  CheckCheck,
  Bell,
  BellOff,
  Copy
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useUnread } from '../context/UnreadContext';
import MentionsInbox from './modals/MentionsInbox';
import { isAdmin } from '../services/permissions';
import { useOverlayUI } from '../context/OverlayUIContext';
import { MUTE_DURATIONS } from '../services/cloud/userSettings';

export default function ServerSidebar() {
  const { showConfirm } = useNotification();
  const {
    servers,
    activeServer,
    setActiveServer,
    pendingInvites,
    openModal,
    deleteServer,
    leaveServer
  } = useServer();
  const { user } = useAuth();
  const { serverSummary, unreadThreadCount, unreadMentions, markServerRead, isServerMuted, muteServer, serverNotifyLevel, setServerNotify } = useUnread();
  const { openMenu } = useOverlayUI();
  const [inboxOpen, setInboxOpen] = useState(false);

  const handleContextMenu = (e, server) => {
    const admin = isAdmin(server, user?.id);
    const muted = isServerMuted(server.id);
    const level = serverNotifyLevel(server.id);
    openMenu(e, [
      { label: 'Marcar como lido', icon: CheckCheck, onClick: () => markServerRead(server) },
      { label: 'Convidar pessoas', icon: UserPlus, onClick: () => { setActiveServer(server); openModal('invite'); } },
      { separator: true },
      ...(muted
        ? [{ label: 'Reativar notificações', icon: Bell, onClick: () => muteServer(server.id, null) }]
        : [
            { heading: 'Silenciar servidor' },
            ...Object.entries({ '1h': '1 hora', '8h': '8 horas', forever: 'Até eu reativar' }).map(([key, label]) => ({
              label,
              icon: BellOff,
              onClick: () => muteServer(server.id, MUTE_DURATIONS[key])
            }))
          ]),
      { heading: 'Notificar' },
      ...[['all', 'Todas as mensagens'], ['mentions', 'Só menções'], ['none', 'Nada']].map(([id, label]) => ({
        label,
        checked: level === id,
        onClick: () => setServerNotify(server.id, id)
      })),
      admin && { separator: true },
      admin && { label: 'Configurações do servidor', icon: Settings, onClick: () => { setActiveServer(server); openModal('serverSettings'); } },
      admin && { label: 'Criar canal', icon: FolderPlus, onClick: () => { setActiveServer(server); openModal('createChannel'); } },
      { separator: true },
      { label: 'Copiar ID do servidor', icon: Copy, onClick: () => navigator.clipboard.writeText(server.id) },
      isOwner(server)
        ? { label: 'Excluir servidor', icon: Trash2, danger: true, onClick: () => handleDeleteServer(server) }
        : { label: 'Sair do servidor', icon: LogOut, danger: true, onClick: () => handleLeaveServer(server) }
    ], server.name);
  };

  const isOwner = (server) => server?.ownerId === user?.id;

  const handleDeleteServer = async (server) => {
    const confirmed = await showConfirm(
      'Excluir Servidor',
      `Deseja realmente excluir o servidor "${server.name}"? Esta ação não pode ser desfeita e removerá todos os canais e membros.`,
      { isDanger: true, confirmText: 'Excluir Servidor' }
    );
    if (confirmed) {
      await deleteServer(server.id);
    }
  };

  const handleLeaveServer = async (server) => {
    const confirmed = await showConfirm(
      'Sair do Servidor',
      `Deseja sair do servidor "${server.name}"?`,
      { isDanger: true, confirmText: 'Sair do Servidor' }
    );
    if (confirmed) {
      await leaveServer(server.id);
    }
  };

  return (
    <aside className="server-sidebar">
      {/* Home / Direct Messages */}
      <div
        className={`server-icon-wrapper ${!activeServer ? 'active' : ''}`}
        title="Mensagens Diretas & Amigos"
      >
        <div className="server-pill" />
        <button
          className="server-btn"
          onClick={() => setActiveServer(null)}
        >
          <Radio size={22} />
          {unreadThreadCount > 0 && <span className="badge-counter">{unreadThreadCount}</span>}
        </button>
      </div>

      {/* Pending Invites Inbox */}
      <div
        className="server-icon-wrapper"
        title="Caixa de Convites Recebidos"
      >
        <div className="server-pill" />
        <button
          className="server-btn"
          onClick={() => openModal('pendingInvites')}
        >
          <Mail size={20} />
          {pendingInvites.length > 0 && (
            <span className="badge-counter">{pendingInvites.length}</span>
          )}
        </button>
      </div>

      {/* Mentions inbox */}
      <div className="server-icon-wrapper" title="Menções">
        <div className="server-pill" />
        <button className="server-btn" onClick={() => setInboxOpen(true)} aria-label="Menções">
          <AtSign size={20} />
          {unreadMentions.length > 0 && <span className="badge-counter">{unreadMentions.length}</span>}
        </button>
      </div>

      <div className="server-divider" />

      {/* Servers List */}
      {servers.map((server) => {
        const isActive = activeServer?.id === server.id;
        const initials = server.name.substring(0, 2).toUpperCase();
        const { unread, mentionCount } = serverSummary(server);

        return (
          <div
            key={server.id}
            className={`server-icon-wrapper ${isActive ? 'active' : ''} ${unread && !isActive ? 'unread' : ''}`}
            title={`${server.name} (Clique com botão direito para opções)`}
            onContextMenu={(e) => handleContextMenu(e, server)}
          >
            <div className="server-pill" />
            <button
              className="server-btn"
              onClick={() => setActiveServer(server)}
            >
              {server.icon ? (
                <img src={server.icon} alt={server.name} />
              ) : (
                <span>{initials}</span>
              )}
              {mentionCount > 0 && <span className="badge-counter">{mentionCount}</span>}
            </button>
          </div>
        );
      })}

      {/* Add / Create Server */}
      <div className="server-icon-wrapper" title="Criar ou Entrar em um Servidor">
        <div className="server-pill" />
        <button
          className="server-btn"
          style={{ borderStyle: 'dashed' }}
          onClick={() => openModal('createServer')}
        >
          <Plus size={22} />
        </button>
      </div>

      {inboxOpen && <MentionsInbox onClose={() => setInboxOpen(false)} />}
    </aside>
  );
}
