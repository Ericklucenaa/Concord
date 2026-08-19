import React, { useState, useEffect } from 'react';
import { useServer } from '../context/ServerContext';
import { useAuth } from '../context/AuthContext';
import { 
  Compass, 
  Plus, 
  Mail, 
  Settings, 
  Image as ImageIcon, 
  UserPlus, 
  Trash2, 
  LogOut, 
  FolderPlus 
} from 'lucide-react';
import { ROLES } from '@shared/constants';
import { useNotification } from '../context/NotificationContext';

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

  const [contextMenu, setContextMenu] = useState(null); // { server, x, y }

  useEffect(() => {
    const handleCloseContext = () => setContextMenu(null);
    window.addEventListener('click', handleCloseContext);
    window.addEventListener('contextmenu', handleCloseContext);
    return () => {
      window.removeEventListener('click', handleCloseContext);
      window.removeEventListener('contextmenu', handleCloseContext);
    };
  }, []);

  const handleContextMenu = (e, server) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveServer(server);
    setContextMenu({
      server,
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 240)
    });
  };

  const isOwner = (server) => server?.ownerId === user?.id || server?.role === ROLES.OWNER || server?.role === 'owner';

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
          style={{ backgroundColor: !activeServer ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: !activeServer ? '#fff' : 'var(--accent-primary)' }}
        >
          <Compass size={24} />
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

      <div className="server-divider" />

      {/* Servers List */}
      {servers.map((server) => {
        const isActive = activeServer?.id === server.id;
        const initials = server.name.substring(0, 2).toUpperCase();

        return (
          <div 
            key={server.id} 
            className={`server-icon-wrapper ${isActive ? 'active' : ''}`}
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

      {/* Server Context Menu */}
      {contextMenu && (
        <div 
          className="context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '6px',
            zIndex: 9999,
            minWidth: 200,
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', marginBottom: 2 }}>
            {contextMenu.server.name}
          </div>

          <button 
            className="dropdown-item btn-secondary" 
            style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
            onClick={() => { setContextMenu(null); openModal('serverSettings'); }}
          >
            <Settings size={15} style={{ color: 'var(--accent-primary)' }} />
            Configurações do Servidor
          </button>

          <button 
            className="dropdown-item btn-secondary" 
            style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
            onClick={() => { setContextMenu(null); openModal('serverSettings'); }}
          >
            <ImageIcon size={15} style={{ color: 'var(--accent-primary)' }} />
            Trocar Foto / Nome
          </button>

          <button 
            className="dropdown-item btn-secondary" 
            style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
            onClick={() => { setContextMenu(null); openModal('invite'); }}
          >
            <UserPlus size={15} style={{ color: 'var(--accent-success)' }} />
            Convidar Pessoas
          </button>

          <button 
            className="dropdown-item btn-secondary" 
            style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent' }}
            onClick={() => { setContextMenu(null); openModal('createChannel'); }}
          >
            <FolderPlus size={15} />
            Criar Canal
          </button>

          <div className="server-divider" style={{ width: '100%', margin: '4px 0' }} />

          {isOwner(contextMenu.server) ? (
            <button 
              className="dropdown-item btn-secondary" 
              style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--accent-danger)' }}
              onClick={() => { setContextMenu(null); handleDeleteServer(contextMenu.server); }}
            >
              <Trash2 size={15} />
              Excluir Servidor
            </button>
          ) : (
            <button 
              className="dropdown-item btn-secondary" 
              style={{ justifyContent: 'flex-start', padding: '8px 10px', fontSize: 13, border: 'none', background: 'transparent', color: 'var(--accent-danger)' }}
              onClick={() => { setContextMenu(null); handleLeaveServer(contextMenu.server); }}
            >
              <LogOut size={15} />
              Sair do Servidor
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
