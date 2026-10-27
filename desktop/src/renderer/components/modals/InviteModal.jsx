import React, { useEffect, useState } from 'react';
import { X, Send, Check, UserPlus, Link as LinkIcon, Trash2, Clock } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { inviteLinkFor, listenToServerInvites, revokeInvite, inviteStatus, INVITE_EXPIRY_OPTIONS } from '../../services/cloud/servers';
import { isAdmin } from '../../services/permissions';

const EXPIRY_LABELS = { '30m': '30 minutos', '1h': '1 hora', '1d': '1 dia', '7d': '7 dias', never: 'Nunca' };
const USES = [0, 1, 5, 10, 25, 100];

function describe(invite) {
  const parts = [];
  parts.push(invite.maxUses ? `${invite.uses || 0}/${invite.maxUses} usos` : `${invite.uses || 0} usos`);
  if (invite.expiresAt) {
    const ms = invite.expiresAt - Date.now();
    parts.push(ms <= 0 ? 'expirado' : ms < 3_600_000 ? `expira em ${Math.ceil(ms / 60000)} min` : ms < 86_400_000 ? `expira em ${Math.ceil(ms / 3_600_000)} h` : `expira em ${Math.ceil(ms / 86_400_000)} d`);
  } else {
    parts.push('não expira');
  }
  return parts.join(' · ');
}

export default function InviteModal() {
  const { activeServer, modalState, closeModal, createInvite, selectedChannelForInvite } = useServer();
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [expiry, setExpiry] = useState('7d');
  const [maxUses, setMaxUses] = useState(0);
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [invites, setInvites] = useState([]);
  const open = Boolean(modalState.invite && activeServer);

  useEffect(() => {
    if (!open) return undefined;
    setGenerated(null);
    setSuccessMessage('');
    setError('');
    return listenToServerInvites(activeServer.id, user.id, isAdmin(activeServer, user.id), setInvites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeServer?.id]);

  if (!open) return null;

  const handleSendInvite = async (e) => {
    e.preventDefault();
    const cleanUser = username.trim().replace(/^@/, '');
    if (!cleanUser) return;
    try {
      setIsLoading(true);
      setError('');
      setSuccessMessage('');
      const data = await createInvite(activeServer.id, { username: cleanUser, channelId: selectedChannelForInvite });
      setSuccessMessage(data.message);
      setUsername('');
    } catch (err) {
      setError(err.message || 'Erro ao enviar convite.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await createInvite(activeServer.id, {
        channelId: selectedChannelForInvite,
        expiresIn: INVITE_EXPIRY_OPTIONS[expiry],
        maxUses: maxUses || null
      });
      setGenerated(data.invite);
    } catch (err) {
      setError(err.message || 'Erro ao gerar link de convite.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLinkFor(generated.code));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const channelName = activeServer.channels?.find((c) => c.id === selectedChannelForInvite)?.name;
  const active = invites.filter((i) => inviteStatus(i) === 'active');

  return (
    <div className="modal-backdrop" onClick={() => closeModal('invite')}>
      <div className="modal-container" style={{ width: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={20} style={{ color: 'var(--accent-primary)' }} />
            <h3 className="modal-title">Convidar para {activeServer.name}</h3>
          </div>
          <button className="icon-btn" onClick={() => closeModal('invite')} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="modal-body">
          {error && <div className="auth-error">{error}</div>}
          {successMessage && <div className="success-banner">{successMessage}</div>}

          <form onSubmit={handleSendInvite} className="form-group">
            <label className="form-label">Enviar para um amigo (@apelido)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="form-input"
                placeholder="@apelido"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ flex: 1 }}
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={isLoading || !username.trim()}>
                <Send size={15} /> Enviar
              </button>
            </div>
            <span className="hint">Chega na caixa de convites da pessoa. Vale para uma entrada e expira em 7 dias.</span>
          </form>

          <div className="form-group">
            <label className="form-label">{channelName ? `Link para #${channelName}` : 'Link de convite'}</label>
            {generated ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" readOnly value={inviteLinkFor(generated.code)} style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                <button className="btn btn-primary" onClick={copyLink}>
                  {copied ? <Check size={15} /> : <LinkIcon size={15} />} {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="form-select" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Validade">
                  {Object.keys(EXPIRY_LABELS).map((k) => <option key={k} value={k}>Expira: {EXPIRY_LABELS[k]}</option>)}
                </select>
                <select className="form-select" value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} aria-label="Limite de usos">
                  {USES.map((n) => <option key={n} value={n}>{n ? `Máx. ${n} ${n === 1 ? 'uso' : 'usos'}` : 'Usos ilimitados'}</option>)}
                </select>
                <button className="btn btn-secondary" onClick={handleGenerate} disabled={isLoading}>
                  <LinkIcon size={15} /> Gerar link
                </button>
              </div>
            )}
          </div>

          {active.length > 0 && (
            <div className="form-group">
              <label className="form-label">{isAdmin(activeServer, user.id) ? 'Convites ativos do servidor' : 'Seus convites ativos'}</label>
              <div className="invite-list">
                {active.map((i) => (
                  <div key={i.code} className="invite-row">
                    <code>{i.code}</code>
                    <span className="invite-row-meta"><Clock size={11} /> {describe(i)} · por @{i.creatorUsername || '—'}</span>
                    <button className="icon-btn hover-danger" title="Revogar convite" aria-label="Revogar convite" onClick={() => revokeInvite(i.code)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={() => closeModal('invite')}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
