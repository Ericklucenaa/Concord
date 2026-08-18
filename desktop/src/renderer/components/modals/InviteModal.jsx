import React, { useState } from 'react';
import { useServer } from '../../context/ServerContext';
import { X, Send, Copy, Check, UserPlus } from 'lucide-react';

export default function InviteModal() {
  const { activeServer, modalState, closeModal, createInvite } = useServer();
  const [username, setUsername] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');

  if (!modalState.invite || !activeServer) return null;

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!username.trim()) return;

    try {
      setIsLoading(true);
      setError('');
      setSuccessMessage('');
      const data = await createInvite(activeServer.id, {
        username: username.trim()
      });

      setSuccessMessage(data.message);
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
      const data = await createInvite(activeServer.id, {});
      setGeneratedCode(data.invite.code);
    } catch (err) {
      setError(err.message || 'Erro ao gerar código de convite.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={() => closeModal('invite')}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Convidar para {activeServer.name}</h3>
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
          {/* Direct User Invite */}
          <form onSubmit={handleSendInvite} className="form-group">
            <label className="form-label">Convidar por Nome de Usuário</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="form-input"
                placeholder="@usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ flex: 1 }}
                autoFocus
              />
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isLoading || !username.trim()}
              >
                <Send size={15} />
                Enviar
              </button>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              O usuário receberá uma notificação instantânea no aplicativo.
            </span>
          </form>

          <div className="server-divider" style={{ width: '100%', margin: '8px 0' }} />

          {/* Generate Invite Code */}
          <div className="form-group">
            <label className="form-label">Ou compartilhe um código de convite</label>
            {generatedCode ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  className="form-input"
                  value={generatedCode}
                  readOnly
                  style={{ flex: 1, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1 }}
                />
                <button className="btn btn-secondary" onClick={copyToClipboard}>
                  {copied ? <Check size={16} style={{ color: 'var(--accent-success)' }} /> : <Copy size={16} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            ) : (
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={handleGenerateCode}
                disabled={isLoading}
              >
                Gerar Novo Código de Convite
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
