import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { X, Check, Trash2, Mail, Users, Link as LinkIcon, Copy, ExternalLink, ArrowRight } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';

export default function PendingInvitesModal() {
  const { showSuccess, showError, showToast } = useNotification();
  const { 
    modalState, 
    closeModal, 
    pendingInvites, 
    respondInvite,
    joinByCode
  } = useServer();
  const [processingId, setProcessingId] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  if (!modalState.pendingInvites) return null;

  const handleRespond = async (invite, action) => {
    const inviteId = invite.id || invite.code;
    try {
      setProcessingId(inviteId);
      await respondInvite(inviteId, action);
      closeModal('pendingInvites');
      showSuccess(
        action === 'accept' ? 'Bem-vindo ao Servidor!' : 'Convite Recusado',
        action === 'accept' 
          ? `Você agora faz parte do servidor "${invite.serverName}".` 
          : 'O convite foi removido da sua caixa de entrada.'
      );
    } catch (err) {
      showError('Erro no Convite', err.message || 'Erro ao processar convite.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCopyLink = (code) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://concord-3af70.web.app';
    const link = `${origin}/#invite=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    showToast('Link do convite copiado!', 'success');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  return (
    <div className="modal-backdrop" onClick={() => closeModal('pendingInvites')}>
      <div className="modal-container" style={{ width: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Mail size={18} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h3 className="modal-title" style={{ fontSize: 16 }}>Caixa de Convites Recebidos</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {pendingInvites.length} {pendingInvites.length === 1 ? 'convite pendente' : 'convites pendentes'}
              </p>
            </div>
          </div>
          <button className="icon-btn" onClick={() => closeModal('pendingInvites')}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pendingInvites.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Mail size={32} style={{ opacity: 0.5, color: 'var(--text-secondary)' }} />
              </div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Sua caixa de convites está vazia</h4>
              <p style={{ fontSize: 13, maxWidth: 360, margin: '0 auto', lineHeight: 1.5 }}>
                Quando seus amigos te convidarem pelo seu @apelido único, os convites aparecerão automaticamente aqui em tempo real.
              </p>
            </div>
          ) : (
            pendingInvites.map((invite) => {
              const inviteId = invite.id || invite.code;
              const code = invite.code || '';
              const origin = typeof window !== 'undefined' ? window.location.origin : 'https://concord-3af70.web.app';
              const fullLink = invite.inviteLink || `${origin}/#invite=${code}`;

              return (
                <div 
                  key={inviteId}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 16,
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    gap: 12,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img 
                        src={invite.serverIcon || `https://api.dicebear.com/7.x/identicon/svg?seed=${invite.serverName}`} 
                        alt="" 
                        style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                      />
                      <div>
                        <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{invite.serverName}</h4>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          Convidado por <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>@{invite.senderUsername}</span>
                        </p>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        className="btn btn-primary"
                        style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
                        disabled={processingId === inviteId}
                        onClick={() => handleRespond(invite, 'accept')}
                        title="Acessar e entrar neste servidor"
                      >
                        <Check size={16} />
                        {processingId === inviteId ? 'Entrando...' : 'Acessar Servidor'}
                      </button>
                      <button 
                        className="btn btn-danger"
                        style={{ padding: '8px 12px', fontSize: 13 }}
                        disabled={processingId === inviteId}
                        onClick={() => handleRespond(invite, 'reject')}
                        title="Recusar e descartar convite"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Clickable Link Bar */}
                  {code && (
                    <div 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        backgroundColor: 'var(--bg-secondary)', 
                        padding: '6px 10px', 
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-color)',
                        fontSize: 12
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <LinkIcon size={13} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>Link:</span>
                        <a 
                          href={fullLink}
                          onClick={(e) => {
                            e.preventDefault();
                            handleRespond(invite, 'accept');
                          }}
                          style={{ 
                            color: 'var(--accent-primary)', 
                            fontWeight: 600, 
                            textDecoration: 'underline', 
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            cursor: 'pointer'
                          }}
                          title="Clique para entrar diretamente no servidor"
                        >
                          {fullLink}
                        </a>
                      </div>

                      <button 
                        className="icon-btn" 
                        onClick={() => handleCopyLink(code)}
                        title="Copiar link do convite"
                        style={{ padding: '2px 6px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        {copiedCode === code ? <Check size={12} style={{ color: 'var(--accent-success)' }} /> : <Copy size={12} />}
                        <span style={{ fontSize: 11 }}>{copiedCode === code ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
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
