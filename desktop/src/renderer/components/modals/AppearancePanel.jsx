import React, { useRef, useState } from 'react';
import { Check, ImagePlus, Link2, Palette, RotateCcw, Ban } from 'lucide-react';
import { THEMES, ACCENT_PRESETS, CHAT_BACKGROUNDS, useAppearance, compressBackground } from '../../services/appearance';
import { useNotification } from '../../context/NotificationContext';

/** Miniature of the app drawn with the theme's own colors. */
function ThemePreview({ colors: [app, panel, accent, text] }) {
  return (
    <div className="theme-mini" style={{ background: app }}>
      <div className="theme-mini-rail" style={{ background: panel }}>
        <span style={{ background: accent }} />
        <span style={{ background: text, opacity: 0.25 }} />
        <span style={{ background: text, opacity: 0.25 }} />
      </div>
      <div className="theme-mini-main" style={{ background: panel }}>
        <span style={{ background: text, width: '70%', opacity: 0.8 }} />
        <span style={{ background: text, width: '45%', opacity: 0.4 }} />
        <span style={{ background: accent, width: '55%' }} />
        <span style={{ background: text, width: '35%', opacity: 0.4 }} />
      </div>
    </div>
  );
}

export default function AppearancePanel() {
  const [appearance, update] = useAppearance();
  const { showError } = useNotification();
  const fileRef = useRef(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [filter, setFilter] = useState('all');

  const safeUpdate = (patch) => {
    try {
      update(patch);
    } catch (err) {
      showError('Aparência', err.message);
    }
  };

  const themes = THEMES.filter((t) => filter === 'all' || (filter === 'light' ? t.light : !t.light));
  const bg = appearance.chatBackground || { type: 'none' };

  const pickImage = async (file) => {
    if (!file) return;
    try {
      safeUpdate({ chatBackground: { type: 'image', value: await compressBackground(file) } });
    } catch (err) {
      showError('Plano de fundo', err.message);
    }
  };

  const applyUrl = () => {
    const url = urlDraft.trim();
    if (!/^https:\/\/\S+$/i.test(url)) {
      showError('Plano de fundo', 'Use um link https:// direto para a imagem.');
      return;
    }
    safeUpdate({ chatBackground: { type: 'image', value: url } });
    setUrlDraft('');
  };

  return (
    <div className="appearance-panel">
      <section className="settings-card">
        <div className="appearance-section-head">
          <div className="settings-card-title">Tema</div>
          <div className="segmented">
            {[['all', 'Todos'], ['dark', 'Escuros'], ['light', 'Claros']].map(([id, label]) => (
              <button key={id} type="button" className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="theme-grid">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-card ${appearance.theme === t.id ? 'active' : ''}`}
              onClick={() => safeUpdate({ theme: t.id })}
              aria-pressed={appearance.theme === t.id}
            >
              <ThemePreview colors={t.preview} />
              <div className="theme-card-text">
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </div>
              {appearance.theme === t.id && <span className="theme-check"><Check size={12} /></span>}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="appearance-section-head">
          <div className="settings-card-title"><Palette size={13} /> Cor de destaque</div>
          {appearance.accent && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => safeUpdate({ accent: null })}>
              <RotateCcw size={13} /> Usar a do tema
            </button>
          )}
        </div>
        <div className="accent-row">
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={`accent-dot ${appearance.accent === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => safeUpdate({ accent: c })}
              aria-label={`Cor ${c}`}
            />
          ))}
          <label className="accent-dot custom" title="Escolher outra cor">
            <input type="color" value={appearance.accent || '#7c6cff'} onChange={(e) => safeUpdate({ accent: e.target.value })} />
            +
          </label>
        </div>
        <div className="hint">Muda botões, seleção, links e destaques em qualquer tema.</div>
      </section>

      <section className="settings-card">
        <div className="settings-card-title">Plano de fundo do chat</div>
        <div className="bg-grid">
          <button type="button" className={`bg-tile none ${bg.type === 'none' ? 'active' : ''}`} onClick={() => safeUpdate({ chatBackground: { type: 'none', value: null } })}>
            <Ban size={18} />
            <span>Nenhum</span>
          </button>
          <button type="button" className={`bg-tile upload ${bg.type === 'image' ? 'active' : ''}`} onClick={() => fileRef.current?.click()}>
            {bg.type === 'image' ? <span className="bg-tile-swatch" style={{ background: `url("${bg.value}") center / cover` }} /> : <ImagePlus size={18} />}
            <span>{bg.type === 'image' ? 'Sua imagem' : 'Enviar imagem'}</span>
          </button>
          {CHAT_BACKGROUNDS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`bg-tile ${bg.type === 'preset' && bg.value === p.id ? 'active' : ''}`}
              onClick={() => safeUpdate({ chatBackground: { type: 'preset', value: p.id } })}
            >
              <span className="bg-tile-swatch" style={{ background: p.css }} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            pickImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <div className="bg-url">
          <Link2 size={14} />
          <input className="form-input" placeholder="…ou cole o link https:// de uma imagem" value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyUrl()} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={applyUrl} disabled={!urlDraft.trim()}>Usar</button>
        </div>

        {bg.type !== 'none' && (
          <div className="bg-sliders">
            <label>
              <span>Escurecer <em>{Math.round(appearance.chatDim * 100)}%</em></span>
              <input type="range" min="0" max="0.9" step="0.05" value={appearance.chatDim} onChange={(e) => safeUpdate({ chatDim: Number(e.target.value) })} />
            </label>
            <label>
              <span>Desfoque <em>{appearance.chatBlur}px</em></span>
              <input type="range" min="0" max="16" step="1" value={appearance.chatBlur} onChange={(e) => safeUpdate({ chatBlur: Number(e.target.value) })} />
            </label>
          </div>
        )}
        <div className="hint">O fundo fica só neste dispositivo e aparece nos canais de texto e nas conversas diretas.</div>
      </section>
    </div>
  );
}
