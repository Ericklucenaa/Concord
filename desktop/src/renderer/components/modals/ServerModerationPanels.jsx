import React, { useEffect, useState } from 'react';
import { ShieldOff } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { listenToAudit } from '../../services/cloud/servers';
import { getUserProfile } from '../../services/cloud/users';
import { isAdmin, ROLE_LABELS } from '../../services/permissions';
import { defaultAvatar } from '../../services/cloud/util';

const ACTION_TEXT = {
  kick: (e) => `expulsou @${e.targetName}`,
  ban: (e) => `baniu @${e.targetName}`,
  unban: (e) => `removeu o banimento de @${e.targetName}`,
  role_change: (e) => `mudou o cargo de @${e.targetName} para ${ROLE_LABELS[e.details] || e.details}`,
  voice_mute: (e) => `silenciou @${e.targetName} na voz`,
  voice_unmute: (e) => `removeu o silêncio de @${e.targetName} na voz`,
  ownership_transfer: (e) => `transferiu a propriedade para @${e.targetName}`,
  channel_create: (e) => `criou o canal ${e.targetName}`,
  channel_update: (e) => `editou o canal ${e.targetName || ''}`,
  channel_delete: (e) => `excluiu o canal ${e.targetName || ''}`,
  server_update: (e) => `atualizou o servidor (${e.details})`
};

export function AuditLogPanel({ server }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => listenToAudit(server.id, setEntries), [server.id]);

  return (
    <div className="modal-body audit-list">
      {entries === null && <div className="side-empty">Carregando…</div>}
      {entries?.length === 0 && <div className="side-empty">Nenhuma ação de moderação registrada ainda.</div>}
      {entries?.map((e) => (
        <div key={e.id} className="audit-row">
          <div>
            <strong>@{e.actorName}</strong> {(ACTION_TEXT[e.action] || ((x) => x.action))(e)}
          </div>
          <span>{new Date(e.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
      ))}
    </div>
  );
}

export function BansPanel({ server }) {
  const { unbanMember } = useServer();
  const { user } = useAuth();
  const { showError } = useNotification();
  const [profiles, setProfiles] = useState({});
  const banned = server.bannedIds || [];

  useEffect(() => {
    banned.forEach((id) => {
      if (profiles[id]) return;
      getUserProfile(id)
        .then((p) => setProfiles((prev) => ({ ...prev, [id]: p || { username: 'Usuário' } })))
        .catch(() => setProfiles((prev) => ({ ...prev, [id]: { username: 'Usuário' } })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banned.join(',')]);

  return (
    <div className="modal-body">
      {banned.length === 0 && <div className="side-empty">Ninguém foi banido deste servidor.</div>}
      {banned.map((id) => {
        const p = profiles[id];
        return (
          <div key={id} className="person-row compact">
            <img src={p?.avatar || defaultAvatar(p?.username || id)} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
            <div className="person-info"><strong>{p?.username || '…'}</strong></div>
            {isAdmin(server, user.id) && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => unbanMember(server.id, { id, username: p?.username || id }).catch((err) => showError('Desbanir', err.message))}
              >
                <ShieldOff size={14} /> Desbanir
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
