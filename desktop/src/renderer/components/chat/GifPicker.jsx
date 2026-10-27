import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

// GIF search through Tenor (Google). Only shown when VITE_TENOR_KEY is set at
// build time; the chosen GIF is sent as a link and rendered by LinkPreview.
const TENOR_KEY = import.meta.env?.VITE_TENOR_KEY || '';
export const gifsEnabled = Boolean(TENOR_KEY);

async function searchGifs(query) {
  const params = new URLSearchParams({
    key: TENOR_KEY,
    client_key: 'concord',
    limit: '24',
    media_filter: 'gif,tinygif',
    contentfilter: 'medium',
    locale: 'pt_BR'
  });
  const endpoint = query ? 'search' : 'featured';
  if (query) params.set('q', query);
  const res = await fetch(`https://tenor.googleapis.com/v2/${endpoint}?${params}`);
  if (!res.ok) throw new Error(`Tenor HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    id: r.id,
    preview: r.media_formats?.tinygif?.url,
    url: r.media_formats?.gif?.url,
    title: r.content_description || ''
  })).filter((g) => g.preview && g.url);
}

export default function GifPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchGifs(query.trim())
        .then((list) => !cancelled && (setResults(list), setError(null)))
        .catch(() => !cancelled && setError('Não foi possível carregar os GIFs.'))
        .finally(() => !cancelled && setLoading(false));
    }, query ? 350 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && !e.target.closest('.gif-toggle') && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="gif-picker" ref={ref} role="dialog" aria-label="Escolher GIF">
      <div className="gif-search">
        <Search size={14} />
        <input autoFocus placeholder="Pesquisar no Tenor" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="gif-grid">
        {loading && results.length === 0 && Array.from({ length: 8 }, (_, i) => <span key={i} className="gif-skeleton sk-line" />)}
        {error && <div className="side-empty">{error}</div>}
        {!loading && !error && results.length === 0 && <div className="side-empty">Nenhum GIF encontrado.</div>}
        {results.map((g) => (
          <button key={g.id} type="button" className="gif-item" title={g.title} onClick={() => onSelect(g.url)}>
            <img src={g.preview} alt={g.title} loading="lazy" referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>
      <div className="gif-footer">Via Tenor</div>
    </div>
  );
}
