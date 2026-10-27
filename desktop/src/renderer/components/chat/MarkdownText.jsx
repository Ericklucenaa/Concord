import React, { useState } from 'react';

// Lightweight markdown: ```code blocks```, `inline code`, **bold**, *italic*,
// _italic_, ~~strike~~, ||spoiler||, > quotes, links and @mentions.
// Everything is rendered as React elements (never innerHTML).

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\|\|[^|\n]+\|\|)|(\*[^*\s][^*\n]*\*)|(_[^_\s][^_\n]*_)|(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(@[\p{L}\p{N}_.]+)/gu;

function Spoiler({ children }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`md-spoiler ${revealed ? 'revealed' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        setRevealed(true);
      }}
      title={revealed ? undefined : 'Clique para revelar o spoiler'}
    >
      {children}
    </span>
  );
}

function renderInline(text, ctx, keyPrefix = 'i') {
  const out = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const [token] = match;
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${index++}`;

    if (match[1]) {
      out.push(<code key={key} className="md-code">{token.slice(1, -1)}</code>);
    } else if (match[2]) {
      out.push(<strong key={key}>{renderInline(token.slice(2, -2), ctx, key)}</strong>);
    } else if (match[3]) {
      out.push(<s key={key}>{renderInline(token.slice(2, -2), ctx, key)}</s>);
    } else if (match[4]) {
      out.push(<Spoiler key={key}>{renderInline(token.slice(2, -2), ctx, key)}</Spoiler>);
    } else if (match[5] || match[6]) {
      out.push(<em key={key}>{renderInline(token.slice(1, -1), ctx, key)}</em>);
    } else if (match[7]) {
      out.push(
        <a key={key} href={token} target="_blank" rel="noreferrer noopener" className="md-link">
          {token}
        </a>
      );
    } else if (match[8]) {
      const name = token.slice(1).toLowerCase();
      const isEveryone = name === 'everyone' || name === 'here';
      const known = isEveryone || ctx.memberNames?.has(name);
      const isMe = ctx.myName && name === ctx.myName.toLowerCase();
      out.push(
        known ? (
          <span key={key} className={`md-mention ${isMe || isEveryone ? 'me' : ''}`}>{token}</span>
        ) : (
          token
        )
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderLines(text, ctx, keyPrefix) {
  const lines = text.split('\n');
  const out = [];
  let quote = [];
  const flushQuote = (key) => {
    if (quote.length === 0) return;
    out.push(
      <blockquote key={`q-${key}`} className="md-quote">
        {quote.map((line, i) => (
          <div key={i}>{renderInline(line, ctx, `${keyPrefix}-q${key}-${i}`)}</div>
        ))}
      </blockquote>
    );
    quote = [];
  };

  lines.forEach((line, i) => {
    if (line.startsWith('> ') || line === '>') {
      quote.push(line.replace(/^> ?/, ''));
      return;
    }
    flushQuote(i);
    out.push(
      <React.Fragment key={`l-${i}`}>
        {renderInline(line, ctx, `${keyPrefix}-${i}`)}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
  flushQuote('end');
  return out;
}

export default function MarkdownText({ text, memberNames, myName }) {
  if (!text) return null;
  const ctx = { memberNames, myName };
  const parts = text.split(/```(?:[a-zA-Z0-9+-]*\n)?([\s\S]*?)```/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="md-codeblock"><code>{part.replace(/\n$/, '')}</code></pre>
        ) : (
          <React.Fragment key={i}>{renderLines(part, ctx, `p${i}`)}</React.Fragment>
        )
      )}
    </>
  );
}

/** Extracts @mentions that match known members. Returns { ids, everyone }. */
export function extractMentions(text, membersByName) {
  const ids = new Set();
  let everyone = false;
  for (const m of String(text || '').matchAll(/@([\p{L}\p{N}_.]+)/gu)) {
    const name = m[1].toLowerCase();
    if (name === 'everyone' || name === 'here') everyone = true;
    const member = membersByName.get(name);
    if (member) ids.add(member.id);
  }
  return { ids: Array.from(ids), everyone };
}

export function firstUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/);
  return match ? match[0] : null;
}
