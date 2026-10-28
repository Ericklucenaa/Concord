import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Star, Headphones, Volume2, Shuffle } from 'lucide-react';
import {
  SOUNDBOARD_SOUNDS,
  SOUND_CATEGORIES,
  soundSynthesizer,
  getSoundboardVolume,
  setSoundboardVolume,
  getFavoriteSounds,
  setFavoriteSounds
} from '../services/soundEffects';
import { useVoice } from '../context/VoiceContext';

// Short pause between broadcasts so nobody floods the call.
const COOLDOWN_MS = 1200;

export default function SoundboardModal({ isOpen, onClose }) {
  const { playSound, activeVoiceChannel } = useVoice();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [favorites, setFavorites] = useState(getFavoriteSounds);
  const [volume, setVolume] = useState(getSoundboardVolume);
  const [lastPlayed, setLastPlayed] = useState(null);
  const [coolingDown, setCoolingDown] = useState(false);
  const cooldownRef = useRef(null);
  const searchRef = useRef(null);

  const inCall = Boolean(activeVoiceChannel?.serverId);

  useEffect(() => {
    if (!isOpen) return undefined;
    setTimeout(() => searchRef.current?.focus(), 50);
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => () => clearTimeout(cooldownRef.current), []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SOUNDBOARD_SOUNDS.filter((s) => {
      if (category === 'favorites' && !favorites.includes(s.id)) return false;
      if (category !== 'all' && category !== 'favorites' && s.category !== category) return false;
      return !q || s.name.toLowerCase().includes(q) || s.emoji.includes(q);
    });
  }, [query, category, favorites]);

  if (!isOpen) return null;

  const toggleFavorite = (id) => {
    const next = favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
    setFavorites(next);
    setFavoriteSounds(next);
  };

  const preview = (id) => soundSynthesizer.play(id, volume);

  const broadcast = (id) => {
    if (!inCall) {
      preview(id);
      return;
    }
    if (coolingDown) return;
    playSound(id);
    setLastPlayed(id);
    setCoolingDown(true);
    cooldownRef.current = setTimeout(() => setCoolingDown(false), COOLDOWN_MS);
  };

  const random = () => {
    const pool = visible.length ? visible : SOUNDBOARD_SOUNDS;
    broadcast(pool[Math.floor(Math.random() * pool.length)].id);
  };

  const tabs = [
    { id: 'all', name: 'Todos', emoji: '🎧' },
    { id: 'favorites', name: 'Favoritos', emoji: '⭐' },
    ...SOUND_CATEGORIES
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container soundboard" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Soundboard">
        <div className="soundboard-head">
          <div>
            <h3 className="modal-title">Soundboard</h3>
            <span className="soundboard-sub">
              {inCall
                ? `Tocando para todos em “${activeVoiceChannel.name}” · ${SOUNDBOARD_SOUNDS.length} sons`
                : 'Fora de uma chamada os sons tocam só para você'}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="soundboard-toolbar">
          <div className="soundboard-search">
            <Search size={14} />
            <input ref={searchRef} placeholder="Buscar som…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="soundboard-volume" title="Volume do soundboard (só para você)">
            <Volume2 size={15} />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => {
                const value = Number(e.target.value);
                setVolume(value);
                setSoundboardVolume(value);
              }}
            />
            <span>{Math.round(volume * 100)}%</span>
          </label>
          <button className="btn btn-secondary btn-sm" onClick={random} title="Tocar um som aleatório">
            <Shuffle size={14} /> Aleatório
          </button>
        </div>

        <div className="soundboard-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={category === t.id} className={category === t.id ? 'active' : ''} onClick={() => setCategory(t.id)}>
              <span>{t.emoji}</span> {t.name}
              {t.id === 'favorites' && favorites.length > 0 && <em>{favorites.length}</em>}
            </button>
          ))}
        </div>

        <div className="soundboard-grid">
          {visible.length === 0 && (
            <div className="side-empty" style={{ gridColumn: '1 / -1' }}>
              {category === 'favorites' ? 'Toque na ⭐ de um som para guardá-lo aqui.' : 'Nenhum som encontrado.'}
            </div>
          )}
          {visible.map((s) => (
            <div
              key={s.id}
              className={`sound-tile ${lastPlayed === s.id && coolingDown ? 'playing' : ''} ${coolingDown && inCall ? 'cooling' : ''}`}
              style={{ '--tile': s.color }}
            >
              <button className="sound-main" onClick={() => broadcast(s.id)} title={inCall ? 'Tocar para todos' : 'Ouvir'}>
                <span className="sound-emoji">{s.emoji}</span>
                <span className="sound-name">{s.name}</span>
              </button>
              <div className="sound-actions">
                <button
                  className={`sound-action ${favorites.includes(s.id) ? 'fav' : ''}`}
                  onClick={() => toggleFavorite(s.id)}
                  aria-label={favorites.includes(s.id) ? 'Remover dos favoritos' : 'Favoritar'}
                  title={favorites.includes(s.id) ? 'Remover dos favoritos' : 'Favoritar'}
                >
                  <Star size={13} fill={favorites.includes(s.id) ? 'currentColor' : 'none'} />
                </button>
                {inCall && (
                  <button className="sound-action" onClick={() => preview(s.id)} aria-label="Ouvir só para mim" title="Ouvir só para mim">
                    <Headphones size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
