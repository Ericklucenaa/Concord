import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { X, Send, Copy, Check, UserPlus, Link as LinkIcon, Sparkles } from 'lucide-react';

export default function InviteModal() {
  const { activeServer, modalState, closeModal, createInvite, selectedChannelForInvite } = useServer();
  const [username, setUsername] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  if (!modalState.invite || !activeServer) return null;

  const handleSendInvite = async (e) => {
    e.preventDefault();
    const cleanUser = username.trim().replace(/^@/, '');
    if (!cleanUser) return;

    try {
      setIsLoading(true);
      setError('');
      setSuccessMessage('');
      const data = await createInvite(activeServer.id, {
        username: cleanUser,
        channelId: selectedChannelForInvite
      });

      setSuccessMessage(data.message || `Convite enviado com sucesso para a caixa de entrada de @${cleanUser}!`);
      setUsername('');
    } catch (err) {
      setError(err.message || 'Erro ao enviar convite.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCode = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await createInvite(activeServer.id, {
        channelId: selectedChannelForInvite
      });
      const code = data?.invite?.code || data?.code || '';
      setGeneratedCode(code);
    } catch (err) {
      setError(err.message || 'Erro ao gerar link de convite.');
    } finally {
      setIsLoading(false);
    }
  };

  const getInviteLink = () => {
    if (!generatedCode) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://concord-3af70.web.app';
    return `${origin}/#invite=${generatedCode}`;
  };

  const copyLinkToClipboard = () => {
    const link = getInviteLink();
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const copyCodeToClipboard = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="modal-backdrop" onClick={() => closeModal('invite')}>
      <div className="modal-container" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={20} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="modal-title">Convidar Amigos para {activeServer.name}</h3>
          </div>
          <button className="icon-btn" onClick={() => closeModal('invite')}>
            <X size={18} />
          </button>
        </div>

        {error && <div className="auth-error" style={{ margin: '16px 20px 0' }}>{error}</div>}
        {successMessage && (
          <div style={{ margin: '16px 20px 0', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            {successMessage}
          </div>
        )}

        <div className="modal-body">
          {/* Direct User Nickname Invite */}
          <form onSubmit={handleSendInvite} className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>Convidar por Apelido Único (@apelido)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="form-input"
                placeholder="Ex: @erick ou @shiftf13"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
                autoFocus
              />
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isLoading || !username.trim()}
              >
                <Send size={15} />
                Enviar Convite
              </button>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              O convite chegará diretamente na caixa de mensagens (`✉️`) desse usuário para ele aceitar.
            </span>
          </form>

          <div className="server-divider" style={{ width: '100%', margin: '14px 0' }} />

          {/* Generate Discord-Style Invite Link */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>
              {selectedChannelForInvite 
                ? `Link de Convite Exclusivo para o Canal #${activeServer.channels?.find(c => c.id === selectedChannelForInvite)?.name || 'Canal'}`
                : 'Link de Convite do Servidor (Estilo Discord)'}
            </label>
            {generatedCode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    value={getInviteLink()}
                    readOnly
                    style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, backgroundColor: 'var(--bg-tertiary)' }}
                  />
                  <button className="btn btn-primary" onClick={copyLinkToClipboard}>
                    {copiedLink ? <Check size={16} /> : <LinkIcon size={16} />}
                    {copiedLink ? 'Link Copiado!' : 'Copiar Link'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                  <a 
                    href={getInviteLink()} 
                    target="_blank" 
                    rel="noreferrer" 
                    style={{ 
                      color: 'var(--accent-primary)', 
                      fontSize: 12, 
                      textDecoration: 'underline', 
                      wordBreak: 'break-all',
                      cursor: 'pointer'
                    }}
                  >
                    Clique aqui para testar o link de convite diretamente
                  </a>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>Código rápido: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{generatedCode}</strong></span>
                  <button 
                    type="button" 
                    onClick={copyCodeToClipboard}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
                  >
                    {copiedCode ? 'Código copiado!' : 'Copiar apenas código'}
                  </button>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)', padding: '6px 10px', borderRadius: 'var(--radius-sm)' }}>
                  ✨ Qualquer pessoa que clicar neste link entrará diretamente no seu servidor. O link não expira.
                </div>
              </div>
            ) : (
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={handleGenerateCode}
                disabled={isLoading}
                style={{ width: '100%', justifyContent: 'center', padding: '10px 0' }}
              >
                <LinkIcon size={16} />
                Gerar Link de Convite do Servidor
              </button>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => closeModal('invite')}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
