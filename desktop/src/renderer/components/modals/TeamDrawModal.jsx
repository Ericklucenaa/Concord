import React, { useState } from 'react';
import { Shuffle, X, Copy } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function drawTeams(people, teamCount) {
  const teams = Array.from({ length: teamCount }, () => []);
  shuffle(people).forEach((p, i) => teams[i % teamCount].push(p));
  return teams;
}

/** Splits the people in the call into random, balanced teams. */
export default function TeamDrawModal({ people, onClose }) {
  const { showToast } = useNotification();
  const [selected, setSelected] = useState(() => new Set(people.map((p) => p.userId)));
  const [teamCount, setTeamCount] = useState(2);
  const [teams, setTeams] = useState(null);

  const pool = people.filter((p) => selected.has(p.userId));

  const copy = () => {
    const text = teams.map((t, i) => `Time ${i + 1}: ${t.map((p) => p.username).join(', ')}`).join('\n');
    navigator.clipboard.writeText(text);
    showToast('Times copiados — cole no chat!', 'success');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Shuffle size={18} /> Sortear times</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Quem participa ({pool.length})</label>
            <div className="role-chips" style={{ paddingLeft: 0 }}>
              {people.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  className={`role-chip ${selected.has(p.userId) ? 'active' : ''}`}
                  onClick={() => setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.userId)) next.delete(p.userId);
                    else next.add(p.userId);
                    return next;
                  })}
                >
                  {p.username}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Número de times</label>
            <select className="form-select" value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))}>
              {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} times</option>)}
            </select>
          </div>
          {teams && (
            <div className="teams-grid">
              {teams.map((team, i) => (
                <div key={i} className="team-card">
                  <div className="team-title">Time {i + 1}</div>
                  {team.map((p) => <div key={p.userId} className="team-member">{p.username}</div>)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          {teams && <button className="btn btn-secondary" onClick={copy}><Copy size={14} /> Copiar</button>}
          <button className="btn btn-primary" disabled={pool.length < teamCount} onClick={() => setTeams(drawTeams(pool, teamCount))}>
            <Shuffle size={15} /> {teams ? 'Sortear de novo' : 'Sortear'}
          </button>
        </div>
      </div>
    </div>
  );
}
