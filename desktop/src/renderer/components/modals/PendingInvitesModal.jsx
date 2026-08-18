import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { api } from '../../services/api';
import { X, Check, Trash2, Mail, Users } from 'lucide-react';

export default function PendingInvitesModal() {
  const { 
    modalState, 
    closeModal, 
    pendingInvites, 
    refreshPendingInvites, 
    refreshServers,
    setActiveServer 
  } = useServer();
  const [processingId, setProcessingId] = useState(null);

  if (!modalState.pendingInvites) return null;

  const handleRespond = async (inviteId, action) => {
    try {
      setProcessingId(inviteId);
      const data = await api.respondInvite(inviteId, action);

      await refreshPendingInvites();
      await refreshServers();

      if (action === 'accept' && data.serverId) {
        const serverData = await api.getServer(data.serverId);
        if (serverData.server) {
          setActiveServer(serverData.server);
        }
        closeModal('pendingInvites');
      }
    } catch (err) {
      alert(err.message || 'Erro ao processar convite.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => closeModal('pendingInvites')}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mail size={20} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="modal-title">Convites Recebidos</h3>
          </div>
          <button className="icon-btn" onClick={() => closeModal('pendingInvites')}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {pendingInvites.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
              <Mail size={36} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <p>Nenhum convite pendente no momento.</p>
            </div>
          ) : (
            pendingInvites.map((invite) => (
              <div 
                key={invite.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img 
                    src={invite.serverIcon || `https://api.dicebear.com/7.x/identicon/svg?seed=${invite.serverName}`} 
                    alt="" 
                    style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
                  />
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700 }}>{invite.serverName}</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Convidado por <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>@{invite.senderUsername}</span>
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button 
                    className="btn btn-primary"
                    style={{ padding: '6px 12px', fontSize: 13 }}
                    disabled={processingId === invite.id}
                    onClick={() => handleRespond(invite.id, 'accept')}
                    title="Aceitar Convite"
                  >
                    <Check size={16} />
                    Aceitar
                  </button>
                  <button 
                    className="btn btn-danger"
                    style={{ padding: '6px 10px', fontSize: 13 }}
                    disabled={processingId === invite.id}
                    onClick={() => handleRespond(invite.id, 'reject')}
                    title="Recusar Convite"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="modal-footer">
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => closeModal('pendingInvites')}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
