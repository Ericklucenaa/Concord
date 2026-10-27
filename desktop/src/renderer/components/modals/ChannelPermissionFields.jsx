import React from 'react';
import { ROLE_LABELS } from '../../services/permissions';

const RESTRICTABLE = ['moderator', 'member'];

/** Read-only toggle + role restriction, shared by channel create/edit dialogs. */
export default function ChannelPermissionFields({ type, readOnly, setReadOnly, allowedRoles, setAllowedRoles }) {
  const restricted = allowedRoles !== null;
  return (
    <>
      {type === 'text' && (
        <label className="toggle-row">
          <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
          <div>
            <strong>Canal de avisos (somente leitura)</strong>
            <span>Apenas moderadores, admins e o dono podem enviar mensagens.</span>
          </div>
        </label>
      )}

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={restricted}
          onChange={(e) => setAllowedRoles(e.target.checked ? ['moderator'] : null)}
        />
        <div>
          <strong>Canal privado</strong>
          <span>Só os cargos escolhidos (e admins) veem este canal.</span>
        </div>
      </label>

      {restricted && (
        <div className="role-chips">
          {RESTRICTABLE.map((role) => {
            const active = allowedRoles.includes(role);
            return (
              <button
                type="button"
                key={role}
                className={`role-chip ${active ? 'active' : ''}`}
                onClick={() => setAllowedRoles(active ? allowedRoles.filter((r) => r !== role) : [...allowedRoles, role])}
              >
                {ROLE_LABELS[role]}
              </button>
            );
          })}
          <span className="role-chip fixed">Admins e dono sempre veem</span>
        </div>
      )}
    </>
  );
}
