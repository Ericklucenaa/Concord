import React, { useEffect, useState } from 'react';
import { Pin, Search, X, Hash } from 'lucide-react';
import { listenToPinned, searchMessages } from '../../services/cloud/messages';
import MarkdownText from './MarkdownText';
import { defaultAvatar } from '../../services/cloud/util';

function ResultItem({ message, subtitle, onClick }) {
  return (
    <button className="side-result" onClick={onClick}>
      <img src={message.authorAvatar || defaultAvatar(message.authorName)} alt="" />
      <div className="side-result-body">
        <div className="side-result-meta">
          <strong>{message.authorName}</strong>
          <span>{new Date(message.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        {subtitle && <div className="side-result-sub"><Hash size={10} />{subtitle}</div>}
        <div className="side-result-text"><MarkdownText text={(message.content || '').slice(0, 300) || '📎 anexo'} /></div>
      </div>
    </button>
  );
}

export function PinnedPanel({ scope, onJump, onClose }) {
  const [pinned, setPinned] = useState(null);
  const key = scope.type === 'channel' ? scope.channelId : scope.threadId;

  useEffect(() => {
    setPinned(null);
    return listenToPinned(scope, setPinned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <aside className="side-panel">
      <header className="side-panel-header">
        <Pin size={16} /> <span>Mensagens fixadas</span>
        <button className="icon-btn" onClick={onClose} title="Fechar"><X size={16} /></button>
      </header>
      <div className="side-panel-body">
        {pinned === null && <div className="side-empty">Carregando…</div>}
        {pinned?.length === 0 && <div className="side-empty">Nenhuma mensagem fixada neste canal ainda.</div>}
        {pinned?.map((m) => <ResultItem key={m.id} message={m} onClick={() => onJump(m)} />)}
      </div>
    </aside>
  );
}

/** Searches the recent history of the given scopes (current channel or the whole server). */
export function SearchPanel({ scopes, channelNames = {}, defaultScope = 'current', onJump, onClose }) {
  const [text, setText] = useState('');
  const [where, setWhere] = useState(defaultScope);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const target = where === 'all' ? scopes.all : scopes.current;
      setResults(await searchMessages(target, text));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="side-panel">
      <header className="side-panel-header">
        <Search size={16} /> <span>Pesquisar</span>
        <button className="icon-btn" onClick={onClose} title="Fechar"><X size={16} /></button>
      </header>
      <form className="side-search" onSubmit={run}>
        <input
          className="form-input"
          autoFocus
          placeholder="Texto ou autor…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {scopes.all && (
          <select className="form-input" value={where} onChange={(e) => setWhere(e.target.value)}>
            <option value="current">Neste canal</option>
            <option value="all">Em todo o servidor</option>
          </select>
        )}
        <button className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? 'Buscando…' : 'Buscar'}</button>
      </form>
      <div className="side-panel-body">
        {results?.length === 0 && <div className="side-empty">Nenhum resultado. A busca cobre as 300 mensagens mais recentes de cada canal.</div>}
        {results?.map((m) => (
          <ResultItem
            key={m.id}
            message={m}
            subtitle={m.scope?.channelId ? channelNames[m.scope.channelId] : null}
            onClick={() => onJump(m)}
          />
        ))}
      </div>
    </aside>
  );
}
