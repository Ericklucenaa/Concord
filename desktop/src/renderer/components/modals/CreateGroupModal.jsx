import React, { useState } from 'react';
import { X, Users, Check } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useDM } from '../../context/DMContext';
import { useNotification } from '../../context/NotificationContext';
import { MAX_GROUP_SIZE } from '../../services/cloud/dms';
import { defaultAvatar } from '../../services/cloud/util';

export default function CreateGroupModal() {
  const { modalState, closeModal, setActiveServer } = useServer();
  const { friendList, createGroup } = useDM();
  const { showError } = useNotification();
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (!modalState.createGroup) return null;

  const close = () => {
    setSelected([]);
    setName('');
    closeModal('createGroup');
  };

  const toggle = (friend) => {
    setSelected((prev) => (prev.some((f) => f.id === friend.id)
      ? prev.filter((f) => f.id !== friend.id)
      : prev.length + 1 < MAX_GROUP_SIZE ? [...prev, friend] : prev));
  };

  const create = async () => {
    setBusy(true);
    try {
      await createGroup(selected, name);
      setActiveServer(null);
      close();
    } catch (err) {
      showError('Criar grupo', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal-container" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Users size={18} /> Novo grupo</h3>
          <button className="icon-btn" onClick={close}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Nome do grupo (opcional)</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="ex: Turma do fim de semana" />
          </div>
          <label className="form-label">Escolha amigos ({selected.length}/{MAX_GROUP_SIZE - 1})</label>
          <div className="group-picker">
            {friendList.length === 0 && <div className="side-empty">Adicione amigos para criar um grupo.</div>}
            {friendList.map((f) => {
              const active = selected.some((s) => s.id === f.id);
              return (
                <button key={f.id} type="button" className={`person-row compact selectable ${active ? 'active' : ''}`} onClick={() => toggle(f)}>
                  <img src={f.avatar || defaultAvatar(f.username)} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                  <div className="person-info"><strong>{f.username}</strong></div>
                  <span className={`check ${active ? 'on' : ''}`}>{active && <Check size={12} />}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={close}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || selected.length === 0} onClick={create}>
            {busy ? 'Criando…' : 'Criar grupo'}
          </button>
        </div>
      </div>
    </div>
  );
}
