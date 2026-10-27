import React, { memo, useEffect, useRef, useState } from 'react';
import { SmilePlus, Reply, Pencil, Pin, PinOff, Trash2, Copy, CornerUpLeft } from 'lucide-react';
import MarkdownText, { firstUrl } from './MarkdownText';
import LinkPreview from './LinkPreview';
import AttachmentView from './AttachmentView';
import EmojiPickerPopover from '../EmojiPickerPopover';
import { defaultAvatar } from '../../services/cloud/util';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '🎉'];
const INVITE_RE = /(?:https?:\/\/[^\s]+)?#invite=([a-zA-Z0-9]+)/i;

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFull(iso) {
  return new Date(iso).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
}

function InviteCard({ code, onJoin }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="invite-card">
      <div className="invite-card-icon">C</div>
      <div style={{ flex: 1 }}>
        <div className="invite-card-label">Convite para um servidor</div>
        <div className="invite-card-code">Código: {code}</div>
      </div>
      <button
        className="btn btn-primary"
        style={{ padding: '6px 12px', fontSize: 12 }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onJoin(code);
          } finally {
            setBusy(false);
          }
        }}
      >
        Entrar
      </button>
    </div>
  );
}

function EditBox({ initial, onSave, onCancel }) {
  const [value, setValue] = useState(initial);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, []);
  return (
    <div className="message-edit">
      <textarea
        ref={ref}
        className="chat-textarea message-edit-input"
        value={value}
        rows={Math.min(8, value.split('\n').length)}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) onSave(value.trim());
          }
        }}
      />
      <div className="message-edit-hint">
        Esc para <button onClick={onCancel}>cancelar</button> • Enter para <button onClick={() => value.trim() && onSave(value.trim())}>salvar</button>
      </div>
    </div>
  );
}

function MessageItem({
  message,
  grouped,
  me,
  memberNames,
  canDelete,
  canPin,
  isEditing,
  isHighlighted,
  isBlockedAuthor,
  mentionsMe,
  onReply,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onReact,
  onPin,
  onOpenImage,
  onJumpTo,
  onJoinInvite
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const isMine = message.authorId === me.id;
  const content = message.content || '';
  const invite = content.match(INVITE_RE);
  const textWithoutInvite = invite ? content.replace(INVITE_RE, '').trim() : content;
  const url = !invite ? firstUrl(content) : null;
  const reactions = Object.entries(message.reactions || {}).filter(([, ids]) => ids?.length > 0);

  if (isBlockedAuthor && !showBlocked) {
    return (
      <div className="message-item blocked">
        <button className="link-button" onClick={() => setShowBlocked(true)}>
          Mensagem de um usuário bloqueado — mostrar
        </button>
      </div>
    );
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={`message-item ${grouped ? 'grouped' : ''} ${mentionsMe ? 'mentioned' : ''} ${isHighlighted ? 'highlighted' : ''} ${message.pending ? 'pending' : ''}`}
    >
      {grouped ? (
        <span className="message-hover-time" title={formatFull(message.createdAt)}>{formatTime(message.createdAt)}</span>
      ) : (
        <img src={message.authorAvatar || defaultAvatar(message.authorName)} alt="" className="message-avatar" />
      )}

      <div className="message-content-wrapper">
        {message.replyTo && (
          <button className="message-reply-ref" onClick={() => onJumpTo?.(message.replyTo.id)} title="Ir para a mensagem original">
            <CornerUpLeft size={12} />
            <strong>@{message.replyTo.authorName}</strong>
            <span>{message.replyTo.content || 'anexo'}</span>
          </button>
        )}

        {!grouped && (
          <div className="message-meta">
            <span className="message-author">{message.authorName}</span>
            <span className="message-time" title={formatFull(message.createdAt)}>{formatTime(message.createdAt)}</span>
            {message.pinned && <Pin size={11} className="message-pinned-icon" title="Mensagem fixada" />}
          </div>
        )}

        {isEditing ? (
          <EditBox initial={content} onSave={(text) => onSaveEdit(message, text)} onCancel={onCancelEdit} />
        ) : (
          <div className="message-text">
            {textWithoutInvite && (
              <MarkdownText text={textWithoutInvite} memberNames={memberNames} myName={me.username} />
            )}
            {message.editedAt && <span className="message-edited" title={formatFull(message.editedAt)}> (editado)</span>}
          </div>
        )}

        {invite && <InviteCard code={invite[1]} onJoin={onJoinInvite} />}
        {message.imageUrl && (
          <img src={message.imageUrl} alt="" className="chat-image" onClick={() => onOpenImage(message.imageUrl)} />
        )}
        {message.attachments.map((a) => (
          <AttachmentView key={a.id} attachment={a} onOpenImage={onOpenImage} />
        ))}
        {url && <LinkPreview url={url} onOpenImage={onOpenImage} />}

        {reactions.length > 0 && (
          <div className="reaction-row">
            {reactions.map(([emoji, ids]) => (
              <button
                key={emoji}
                className={`reaction-pill ${ids.includes(me.id) ? 'mine' : ''}`}
                onClick={() => onReact(message, emoji)}
                title={`${ids.length} ${ids.length === 1 ? 'reação' : 'reações'}`}
              >
                <span>{emoji}</span>
                <span className="reaction-count">{ids.length}</span>
              </button>
            ))}
          </div>
        )}

        {pickerOpen && (
          <EmojiPickerPopover
            onSelectEmoji={(emoji) => {
              onReact(message, emoji);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>

      {!isEditing && !message.pending && (
        <div className="message-actions message-toolbar">
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} className="icon-btn" onClick={() => onReact(message, emoji)} title={`Reagir com ${emoji}`}>
              {emoji}
            </button>
          ))}
          <button className="icon-btn" onClick={() => setPickerOpen((v) => !v)} title="Mais reações">
            <SmilePlus size={15} />
          </button>
          <button className="icon-btn" onClick={() => onReply(message)} title="Responder">
            <Reply size={15} />
          </button>
          {isMine && (
            <button className="icon-btn" onClick={() => onStartEdit(message)} title="Editar">
              <Pencil size={14} />
            </button>
          )}
          {canPin && (
            <button className="icon-btn" onClick={() => onPin(message)} title={message.pinned ? 'Desafixar' : 'Fixar mensagem'}>
              {message.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            </button>
          )}
          <button className="icon-btn" onClick={() => navigator.clipboard.writeText(content)} title="Copiar texto">
            <Copy size={14} />
          </button>
          {(isMine || canDelete) && (
            <button className="icon-btn hover-danger" onClick={() => onDelete(message)} title="Excluir">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(MessageItem);
