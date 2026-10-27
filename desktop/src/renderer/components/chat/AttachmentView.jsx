import React, { useEffect, useState } from 'react';
import { Download, FileText, Loader } from 'lucide-react';
import { getAttachmentUrl, formatBytes } from '../../services/cloud/attachments';

export default function AttachmentView({ attachment, onOpenImage }) {
  const isImage = attachment.type?.startsWith('image/');
  const isVideo = attachment.type?.startsWith('video/');
  const isAudio = attachment.type?.startsWith('audio/');
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Media is loaded right away; other files only when the user downloads them.
  useEffect(() => {
    if (!isImage && !isVideo && !isAudio) return undefined;
    let cancelled = false;
    getAttachmentUrl(attachment.id)
      .then((u) => !cancelled && setUrl(u))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [attachment.id, isImage, isVideo, isAudio]);

  const download = async () => {
    try {
      setLoading(true);
      const objectUrl = url || (await getAttachmentUrl(attachment.id));
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = attachment.name || 'arquivo';
      a.click();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return <div className="attachment-card error">Não foi possível carregar "{attachment.name}".</div>;
  }

  if (isImage) {
    return url ? (
      <img src={url} alt={attachment.name} className="chat-image" onClick={() => onOpenImage?.(url)} />
    ) : (
      <div className="attachment-placeholder"><Loader size={16} className="spin" /> Carregando imagem…</div>
    );
  }

  if (isVideo && url) return <video src={url} controls className="chat-video" />;
  if (isAudio && url) return <audio src={url} controls className="chat-audio" />;

  return (
    <div className="attachment-card">
      <FileText size={28} className="attachment-icon" />
      <div className="attachment-meta">
        <div className="attachment-name" title={attachment.name}>{attachment.name}</div>
        <div className="attachment-size">{formatBytes(attachment.size || 0)}</div>
      </div>
      <button className="icon-btn" onClick={download} title="Baixar arquivo" disabled={loading}>
        {loading ? <Loader size={16} className="spin" /> : <Download size={16} />}
      </button>
    </div>
  );
}
