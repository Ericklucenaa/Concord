import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { logWarn } from '../../services/log';

const cache = new Map();

function youtubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;

/**
 * Preview card for the first link in a message. YouTube and direct images are
 * resolved locally; other pages are fetched by the desktop main process
 * (the browser cannot read other sites because of CORS).
 */
export default function LinkPreview({ url, onOpenImage }) {
  const [meta, setMeta] = useState(() => cache.get(url) || null);
  const yt = youtubeId(url);
  const isImage = IMAGE_EXT.test(url);

  useEffect(() => {
    if (yt || isImage || cache.has(url) || !window.electronAPI?.fetchLinkPreview) return undefined;
    let cancelled = false;
    window.electronAPI.fetchLinkPreview(url)
      .then((data) => {
        cache.set(url, data || {});
        if (!cancelled) setMeta(data || {});
      })
      .catch((err) => {
        logWarn('link preview', err);
        cache.set(url, {});
      });
    return () => {
      cancelled = true;
    };
  }, [url, yt, isImage]);

  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }

  if (isImage) {
    return (
      <img src={url} alt="" className="chat-image" loading="lazy" onClick={() => onOpenImage?.(url)} referrerPolicy="no-referrer" />
    );
  }

  if (yt) {
    return (
      <a className="link-preview" href={url} target="_blank" rel="noreferrer noopener">
        <div className="link-preview-site">YouTube</div>
        <img className="link-preview-video" src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" />
      </a>
    );
  }

  if (!meta?.title) return null;

  return (
    <a className="link-preview" href={url} target="_blank" rel="noreferrer noopener">
      <div className="link-preview-body">
        <div className="link-preview-site">{meta.siteName || host}</div>
        <div className="link-preview-title">{meta.title}</div>
        {meta.description && <div className="link-preview-desc">{meta.description}</div>}
      </div>
      {meta.image && <img className="link-preview-thumb" src={meta.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
      <ExternalLink size={12} className="link-preview-icon" />
    </a>
  );
}
