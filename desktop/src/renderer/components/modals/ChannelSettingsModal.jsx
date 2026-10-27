import React, { useState } from 'react';
import { X, Hash, Volume2 } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useNotification } from '../../context/NotificationContext';
import { channelAllowedRoles, isChannelReadOnly } from '../../services/permissions';
import ChannelPermissionFields from './ChannelPermissionFields';

export default function ChannelSettingsModal({ channel, onClose }) {
  const { activeServer, updateChannel } = useServer();
  const { showSuccess, showError } = useNotification();
  const [name, setName] = useState(channel.name);
  const [readOnly, setReadOnly] = useState(isChannelReadOnly(activeServer, channel.id));
  const [allowedRoles, setAllowedRoles] = useState(channelAllowedRoles(activeServer, channel.id));
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (allowedRoles && allowedRoles.length === 0) {
      showError('Canal privado', 'Escolha pelo menos um cargo ou desmarque "Canal privado".');
      return;
    }
    setSaving(true);
    try {
      await updateChannel(activeServer.id, channel.id, { name, readOnly, allowedRoles });
      showSuccess('Canal atualizado', `As configurações de ${channel.type === 'text' ? '#' : ''}${name} foram salvas.`);
      onClose();
    } catch (err) {
      showError('Erro ao salvar', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {channel.type === 'text' ? <Hash size={18} /> : <Volume2 size={18} />}
            Configurações do canal
          </h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={save}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Nome do canal</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required />
            </div>
            <ChannelPermissionFields
              type={channel.type}
              readOnly={readOnly}
              setReadOnly={setReadOnly}
              allowedRoles={allowedRoles}
              setAllowedRoles={setAllowedRoles}
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
