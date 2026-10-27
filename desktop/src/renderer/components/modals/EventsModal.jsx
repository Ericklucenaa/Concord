import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, X, Plus, Trash2, Check, HelpCircle, XCircle } from 'lucide-react';
import { useServer } from '../../context/ServerContext';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { createEvent, setRsvp, deleteEvent } from '../../services/cloud/servers';
import { isModerator } from '../../services/permissions';
import { showNativeNotification } from '../../services/notificationService';

const RSVP = [
  ['going', 'Vou', Check],
  ['maybe', 'Talvez', HelpCircle],
  ['no', 'Não vou', XCircle]
];

function formatWhen(ms) {
  return new Date(ms).toLocaleString([], { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function defaultStart() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Reminds people who RSVP'd "going" when an event starts. */
export function useEventReminders() {
  const { events, activeServer } = useServer();
  const { user } = useAuth();
  const notified = useRef(new Set());
  useEffect(() => {
    if (!user) return undefined;
    const check = () => {
      events.forEach((e) => {
        const soon = e.startsAt - Date.now();
        if (soon <= 0 && soon > -5 * 60_000 && e.rsvps?.[user.id] === 'going' && !notified.current.has(e.id)) {
          notified.current.add(e.id);
          showNativeNotification(`📅 Começou: ${e.title}`, { body: activeServer?.name || '', tag: `event_${e.id}` });
        }
      });
    };
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [events, user, activeServer?.name]);
}

export default function EventsModal({ onClose }) {
  const { activeServer, events } = useServer();
  const { user } = useAuth();
  const { showError, showSuccess } = useNotification();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState(defaultStart);
  const [busy, setBusy] = useState(false);

  const upcoming = events.filter((e) => e.startsAt > Date.now() - 3 * 60 * 60_000);
  const canManage = (e) => e.createdBy === user.id || isModerator(activeServer, user.id);

  const create = async (ev) => {
    ev.preventDefault();
    const startsAt = new Date(when).getTime();
    if (!title.trim() || Number.isNaN(startsAt)) return;
    setBusy(true);
    try {
      await createEvent(activeServer.id, user, { title, description, startsAt });
      showSuccess('Evento criado', 'Os membros do servidor já podem confirmar presença.');
      setCreating(false);
      setTitle('');
      setDescription('');
    } catch (err) {
      showError('Criar evento', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalendarDays size={18} /> Eventos de {activeServer?.name}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          {creating ? (
            <form onSubmit={create} className="event-form">
              <div className="form-group">
                <label className="form-label">Título</label>
                <input className="form-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Noite de jogos" />
              </div>
              <div className="form-group">
                <label className="form-label">Quando</label>
                <input className="form-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Descrição (opcional)</label>
                <textarea className="form-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
                <button className="btn btn-primary" disabled={busy || !title.trim()}>Criar evento</button>
              </div>
            </form>
          ) : (
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setCreating(true)}>
              <Plus size={15} /> Novo evento
            </button>
          )}

          {upcoming.length === 0 && !creating && <div className="side-empty">Nenhum evento marcado. Que tal combinar uma partida?</div>}

          {upcoming.map((e) => {
            const mine = e.rsvps?.[user.id];
            const going = Object.values(e.rsvps || {}).filter((v) => v === 'going').length;
            const maybe = Object.values(e.rsvps || {}).filter((v) => v === 'maybe').length;
            const live = e.startsAt <= Date.now();
            return (
              <div key={e.id} className={`event-card ${live ? 'live' : ''}`}>
                <div className="event-when">{live ? '🔴 Acontecendo agora' : formatWhen(e.startsAt)}</div>
                <div className="event-title">{e.title}</div>
                {e.description && <p className="event-desc">{e.description}</p>}
                <div className="event-meta">{going} vão · {maybe} talvez · criado por @{e.createdByName}</div>
                <div className="event-actions">
                  {RSVP.map(([id, label, Icon]) => (
                    <button
                      key={id}
                      className={`role-chip ${mine === id ? 'active' : ''}`}
                      onClick={() => setRsvp(e.id, user.id, mine === id ? null : id).catch((err) => showError('Presença', err.message))}
                    >
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                  {canManage(e) && (
                    <button className="icon-btn hover-danger" style={{ marginLeft: 'auto' }} aria-label="Excluir evento" onClick={() => deleteEvent(e.id)}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
