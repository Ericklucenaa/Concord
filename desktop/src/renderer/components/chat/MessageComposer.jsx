import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Paperclip, Send, Smile, X, FileText, Lock, CornerUpLeft, Mic, Square, BarChart3, Trash2 } from 'lucide-react';
import GifPicker, { gifsEnabled } from './GifPicker';
import EmojiPickerPopover from '../EmojiPickerPopover';
import { formatBytes, MAX_ATTACHMENT_BYTES } from '../../services/cloud/attachments';
import { MAX_CONTENT_LENGTH } from '../../services/cloud/messages';
import { defaultAvatar } from '../../services/cloud/util';

const MENTION_QUERY = /(^|\s)@([\p{L}\p{N}_.]*)$/u;
const MAX_FILES = 5;
const MAX_VOICE_SECONDS = 120;

function formatSeconds(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Records a short voice message with MediaRecorder (Opus in WebM). */
function useVoiceRecorder(onDone, onError) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const cancelledRef = useRef(false);

  const stop = (cancel = false) => {
    cancelledRef.current = cancel;
    clearInterval(timerRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setRecording(false);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelledRef.current || chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onDone(new File([blob], `mensagem-de-voz-${Date.now()}.webm`, { type: 'audio/webm' }));
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_VOICE_SECONDS) stop(false);
          return s + 1;
        });
      }, 1000);
    } catch {
      onError?.('Não foi possível acessar o microfone para gravar.');
    }
  };

  useEffect(() => () => stop(true), []);
  return { recording, seconds, start, stop };
}

function draftKey(key) {
  return `concord_draft_${key}`;
}

/**
 * Message input with @mention autocomplete, reply bar, file queue and drafts.
 * Parent receives `onSend(text, files)`; files are uploaded by the parent.
 */
const MessageComposer = forwardRef(function MessageComposer(
  {
    scopeKey,
    placeholder,
    disabledReason,
    members = [],
    allowEveryone = false,
    replyTo,
    onCancelReply,
    onSend,
    onTyping,
    onEditLast,
    onError,
    onCreatePoll,
    uploadProgress
  },
  ref
) {
  const [text, setText] = useState(() => localStorage.getItem(draftKey(scopeKey)) || '');
  const [files, setFiles] = useState([]); // { file, previewUrl }
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [mention, setMention] = useState(null); // { query, start }
  const [mentionIndex, setMentionIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const voice = useVoiceRecorder(
    (file) => {
      Promise.resolve(onSend('', [file])).catch((err) => onError?.(err.message || 'Não foi possível enviar o áudio.'));
    },
    onError
  );

  // Restore the draft of the conversation being shown.
  useEffect(() => {
    setText(localStorage.getItem(draftKey(scopeKey)) || '');
    setFiles([]);
    setMention(null);
  }, [scopeKey]);

  useEffect(() => {
    try {
      if (text) localStorage.setItem(draftKey(scopeKey), text);
      else localStorage.removeItem(draftKey(scopeKey));
    } catch {
      // Drafts are a convenience; ignore quota errors.
    }
  }, [text, scopeKey]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    const tooBig = incoming.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) onError?.(`"${tooBig.name}" passa do limite de 8 MB.`);
    const accepted = incoming.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    setFiles((prev) => {
      const next = [...prev, ...accepted.map((file) => ({
        file,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      }))];
      if (next.length > MAX_FILES) onError?.(`Envie no máximo ${MAX_FILES} arquivos por mensagem.`);
      return next.slice(0, MAX_FILES);
    });
    textareaRef.current?.focus();
  };

  useImperativeHandle(ref, () => ({
    addFiles,
    focus: () => textareaRef.current?.focus(),
    insertText: (value) => setText((prev) => prev + value)
  }));

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    const list = members
      .filter((m) => m.username?.toLowerCase().startsWith(q))
      .slice(0, 8)
      .map((m) => ({ id: m.id, label: m.username, avatar: m.avatar }));
    if (allowEveryone && 'everyone'.startsWith(q)) list.push({ id: 'everyone', label: 'everyone', special: true });
    return list;
  }, [mention, members, allowEveryone]);

  const updateMentionState = (value, caret) => {
    const match = value.slice(0, caret).match(MENTION_QUERY);
    if (match) {
      setMention({ query: match[2], start: caret - match[2].length - 1 });
      setMentionIndex(0);
    } else {
      setMention(null);
    }
  };

  const applySuggestion = (s) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, mention.start);
    const after = text.slice(caret);
    const insert = `@${s.label} `;
    const next = before + insert + after;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = before.length + insert.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const submit = async () => {
    if (disabledReason || sending) return;
    const content = text.trim();
    if (!content && files.length === 0) return;
    if (content.length > MAX_CONTENT_LENGTH) {
      onError?.(`A mensagem passa do limite de ${MAX_CONTENT_LENGTH} caracteres.`);
      return;
    }
    setSending(true);
    try {
      await onSend(content, files.map((f) => f.file));
      files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      setText('');
      setFiles([]);
      setEmojiOpen(false);
    } catch (err) {
      onError?.(err.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (mention && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (e.key === 'Escape' && replyTo) {
      onCancelReply?.();
      return;
    }
    if (e.key === 'ArrowUp' && !text && files.length === 0) {
      e.preventDefault();
      onEditLast?.();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e) => {
    const pasted = Array.from(e.clipboardData?.files || []);
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  if (disabledReason) {
    return (
      <div className="chat-input-container">
        <div className="chat-input-box disabled">
          <Lock size={16} />
          <span>{disabledReason}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-input-container" style={{ position: 'relative' }}>
      {mention && suggestions.length > 0 && (
        <div className="mention-popup">
          <div className="mention-popup-title">Membros</div>
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              className={`mention-option ${i === mentionIndex ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(s);
              }}
            >
              {s.special ? <span className="mention-everyone">@</span> : <img src={s.avatar || defaultAvatar(s.label)} alt="" />}
              <span>{s.special ? '@everyone — notificar todos' : s.label}</span>
            </button>
          ))}
        </div>
      )}

      {replyTo && (
        <div className="composer-reply">
          <CornerUpLeft size={14} />
          <span>Respondendo a <strong>@{replyTo.authorName}</strong></span>
          <span className="composer-reply-text">{replyTo.content || 'anexo'}</span>
          <button className="icon-btn" onClick={onCancelReply} title="Cancelar resposta"><X size={14} /></button>
        </div>
      )}

      {files.length > 0 && (
        <div className="composer-files">
          {files.map((f, i) => (
            <div key={`${f.file.name}-${i}`} className="composer-file">
              {f.previewUrl ? <img src={f.previewUrl} alt="" /> : <FileText size={28} />}
              <div className="composer-file-name" title={f.file.name}>{f.file.name}</div>
              <div className="composer-file-size">{formatBytes(f.file.size)}</div>
              <button
                className="icon-btn hover-danger composer-file-remove"
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                title="Remover"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {uploadProgress !== null && uploadProgress !== undefined && (
        <div className="upload-progress"><div style={{ width: `${uploadProgress}%` }} /></div>
      )}

      {voice.recording ? (
        <div className="chat-input-box recording">
          <span className="rec-dot" />
          <span className="rec-time">{formatSeconds(voice.seconds)} / {formatSeconds(MAX_VOICE_SECONDS)}</span>
          <span className="rec-hint">Gravando mensagem de voz…</span>
          <button className="icon-btn hover-danger" onClick={() => voice.stop(true)} title="Descartar" aria-label="Descartar gravação">
            <Trash2 size={17} />
          </button>
          <button className="btn btn-primary" onClick={() => voice.stop(false)} title="Enviar áudio" style={{ height: 34 }}>
            <Square size={13} /> Enviar
          </button>
        </div>
      ) : (
      <div className="chat-input-box">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Anexar arquivos (até 8 MB)" aria-label="Anexar arquivos">
          <Paperclip size={18} />
        </button>
        {onCreatePoll && (
          <button className="icon-btn" onClick={onCreatePoll} title="Criar enquete" aria-label="Criar enquete">
            <BarChart3 size={18} />
          </button>
        )}
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={placeholder}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            updateMentionState(e.target.value, e.target.selectionStart);
            if (e.target.value) onTyping?.();
          }}
          onClick={(e) => updateMentionState(text, e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
        />
        {gifsEnabled && (
          <button className="icon-btn gif-toggle" onClick={() => setGifOpen((v) => !v)} title="GIFs" aria-label="Enviar GIF">
            <span className="gif-label">GIF</span>
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <button className="icon-btn" onClick={() => setEmojiOpen((v) => !v)} title="Emojis">
            <Smile size={18} />
          </button>
        </div>
        {!text.trim() && files.length === 0 ? (
          <button className="icon-btn" onClick={voice.start} title="Gravar mensagem de voz" aria-label="Gravar mensagem de voz">
            <Mic size={18} />
          </button>
        ) : (
          <button
            className="btn btn-primary composer-send"
            onClick={submit}
            disabled={sending}
            title="Enviar (Enter)"
            aria-label="Enviar mensagem"
          >
            <Send size={15} />
          </button>
        )}
      </div>
      )}

      {gifOpen && (
        <GifPicker
          onClose={() => setGifOpen(false)}
          onSelect={(url) => {
            setGifOpen(false);
            Promise.resolve(onSend(url, [])).catch((err) => onError?.(err.message || 'Não foi possível enviar o GIF.'));
          }}
        />
      )}

      {emojiOpen && (
        <EmojiPickerPopover
          onSelectEmoji={(emoji) => {
            setText((prev) => prev + emoji);
            setEmojiOpen(false);
            textareaRef.current?.focus();
          }}
          onClose={() => setEmojiOpen(false)}
        />
      )}
    </div>
  );
});

export default MessageComposer;
