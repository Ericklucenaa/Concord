import React from 'react';
import { useServer } from '../context/ServerContext';
import { Compass, Plus, Mail } from 'lucide-react';

export default function ServerSidebar() {
  const { 
    servers, 
    activeServer, 
    setActiveServer, 
    pendingInvites, 
    openModal 
  } = useServer();

  return (
    <aside className="server-sidebar">
      {/* Pending Invites / Home */}
      <div 
        className={`server-icon-wrapper ${!activeServer ? 'active' : ''}`}
        title="Convites e Notificações"
      >
        <div className="server-pill" />
        <button 
          className="server-btn"
          onClick={() => openModal('pendingInvites')}
        >
          <Mail size={22} />
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
            title={server.name}
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
    </aside>
  );
}
