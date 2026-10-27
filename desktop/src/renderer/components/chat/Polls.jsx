import React, { useState } from 'react';
import { BarChart3, Plus, X, Check } from 'lucide-react';
import { newId } from '../../services/cloud/util';

const DURATIONS = { '1h': 60 * 60_000, '8h': 8 * 60 * 60_000, '1d': 24 * 60 * 60_000, '3d': 3 * 24 * 60 * 60_000, '7d': 7 * 24 * 60 * 60_000 };

export function PollModal({ onClose, onCreate }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [duration, setDuration] = useState('1d');
  const [busy, setBusy] = useState(false);

  const valid = question.trim() && options.filter((o) => o.trim()).length >= 2;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await onCreate({
        question: question.trim().slice(0, 200),
        options: options.filter((o) => o.trim()).map((text) => ({ id: newId('opt').slice(-10), text: text.trim().slice(0, 80) })),
        multi,
        endsAt: Date.now() + DURATIONS[duration]
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-container" style={{ width: 480 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={18} /> Criar enquete</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Pergunta</label>
            <input className="form-input" autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} placeholder="Qual jogo hoje à noite?" />
          </div>
          <div className="form-group">
            <label className="form-label">Opções</label>
            {options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <input
                  className="form-input"
                  style={{ flex: 1 }}
                  value={opt}
                  maxLength={80}
                  placeholder={`Opção ${i + 1}`}
                  onChange={(e) => setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))}
                />
                {options.length > 2 && (
                  <button type="button" className="icon-btn hover-danger" aria-label="Remover opção" onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}>
                    <X size={15} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOptions((prev) => [...prev, ''])}>
                <Plus size={14} /> Adicionar opção
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="toggle-row" style={{ padding: 0 }}>
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
              <div><strong>Permitir várias respostas</strong></div>
            </label>
            <select className="form-select" value={duration} onChange={(e) => setDuration(e.target.value)} style={{ marginLeft: 'auto' }}>
              <option value="1h">Termina em 1 hora</option>
              <option value="8h">Termina em 8 horas</option>
              <option value="1d">Termina em 1 dia</option>
              <option value="3d">Termina em 3 dias</option>
              <option value="7d">Termina em 7 dias</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!valid || busy}>{busy ? 'Publicando…' : 'Publicar enquete'}</button>
        </div>
      </form>
    </div>
  );
}

function timeLeft(endsAt) {
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'Encerrada';
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `Termina em ${Math.floor(h / 24)} d`;
  if (h >= 1) return `Termina em ${h} h`;
  return `Termina em ${Math.max(1, Math.round(ms / 60000))} min`;
}

export function PollCard({ poll, votes = {}, myId, onVote }) {
  const ended = poll.endsAt && Date.now() >= poll.endsAt;
  const mine = votes[myId] || [];
  const voters = Object.keys(votes).length;
  const counts = Object.fromEntries(poll.options.map((o) => [o.id, 0]));
  Object.values(votes).forEach((ids) => (ids || []).forEach((id) => { if (id in counts) counts[id] += 1; }));
  const max = Math.max(1, ...Object.values(counts));
  const showResults = ended || mine.length > 0;

  const toggle = (optionId) => {
    if (ended) return;
    if (poll.multi) onVote(mine.includes(optionId) ? mine.filter((id) => id !== optionId) : [...mine, optionId]);
    else onVote(mine.includes(optionId) ? [] : [optionId]);
  };

  return (
    <div className="poll-card">
      <div className="poll-question"><BarChart3 size={16} /> {poll.question}</div>
      <div className="poll-sub">{poll.multi ? 'Escolha uma ou mais opções' : 'Escolha uma opção'}</div>
      <div className="poll-options">
        {poll.options.map((o) => {
          const count = counts[o.id];
          const pct = voters ? Math.round((count / voters) * 100) : 0;
          const selected = mine.includes(o.id);
          return (
            <button key={o.id} className={`poll-option ${selected ? 'selected' : ''} ${ended ? 'ended' : ''}`} onClick={() => toggle(o.id)} disabled={ended}>
              {showResults && <span className="poll-bar" style={{ width: `${(count / max) * 100}%` }} />}
              <span className="poll-check">{selected && <Check size={12} />}</span>
              <span className="poll-text">{o.text}</span>
              {showResults && <span className="poll-count">{pct}% · {count}</span>}
            </button>
          );
        })}
      </div>
      <div className="poll-footer">{voters} {voters === 1 ? 'voto' : 'votos'} · {timeLeft(poll.endsAt)}</div>
    </div>
  );
}
