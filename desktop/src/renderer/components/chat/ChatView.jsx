import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { useUnread } from '../../context/UnreadContext';
import { useMessages, useTyping } from '../../hooks/useMessages';
import {
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  setPinned,
  scopeKey as keyOf
} from '../../services/cloud/messages';
import {
  uploadAttachment,
  compressImage,
  deleteAttachment,
  INLINE_IMAGE_LIMIT_CHARS
} from '../../services/cloud/attachments';
import { extractMentions } from './MarkdownText';
import MessageItem from './MessageItem';
import MessageComposer from './MessageComposer';
import ImageLightboxModal from '../ImageLightboxModal';
import { logWarn } from '../../services/log';

const GROUP_WINDOW_MS = 5 * 60_000;

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString([], { day: '2-digit', month: 'long', year: 'numeric' });
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const type = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * The conversation view shared by server channels and DMs.
 */
const ChatView = forwardRef(function ChatView(
  {
    scope,
    attachmentScope,
    members = [],
    canModerate = false,
    canPin = false,
    allowEveryone = false,
    disabledReason = null,
    placeholder,
    emptyState,
    blockedIds = [],
    onJoinInvite
  },
  ref
) {
  const { user } = useAuth();
  const { showError, showConfirm, showSuccess, showToast } = useNotification();
  const { markRead } = useUnread();
  const key = keyOf(scope);
  const { messages, hasMore, loadMore, loading, error } = useMessages(scope);
  const { typingNames, notifyTyping, stopTyping } = useTyping(key, user);

  const [replyTo, setReplyTo] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const listRef = useRef(null);
  const composerRef = useRef(null);
  const prependRef = useRef(null);
  const atBottomRef = useRef(true);
  const lastCountRef = useRef(0);

  const memberNames = useMemo(() => new Set(members.map((m) => m.username?.toLowerCase()).filter(Boolean)), [members]);
  const membersByName = useMemo(() => new Map(members.map((m) => [m.username?.toLowerCase(), m])), [members]);

  useEffect(() => {
    setReplyTo(null);
    setEditingId(null);
    lastCountRef.current = 0;
    atBottomRef.current = true;
    setAtBottom(true);
  }, [key]);

  // --- Scrolling -------------------------------------------------------------

  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prependRef.current) {
      // Older page loaded above: keep the viewport where it was.
      el.scrollTop = el.scrollHeight - prependRef.current.height + prependRef.current.top;
      prependRef.current = null;
    } else if (messages.length !== lastCountRef.current) {
      const newest = messages[messages.length - 1];
      if (atBottomRef.current || lastCountRef.current === 0 || newest?.authorId === user.id) scrollToBottom(lastCountRef.current !== 0);
    }
    lastCountRef.current = messages.length;
  }, [messages, user.id]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = bottom;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (el.scrollTop < 150 && hasMore && !prependRef.current) {
      prependRef.current = { height: el.scrollHeight, top: el.scrollTop };
      loadMore();
    }
  };

  // Mark as read when the newest message is on screen and the window is focused.
  const newestAt = messages[messages.length - 1]?.createdAt;
  useEffect(() => {
    if (!newestAt || !atBottom) return undefined;
    const apply = () => document.hasFocus() && markRead(key, newestAt);
    apply();
    window.addEventListener('focus', apply);
    return () => window.removeEventListener('focus', apply);
  }, [newestAt, atBottom, key, markRead]);

  const jumpTo = useCallback((messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) {
      showError('Mensagem antiga', 'Role para cima para carregar o histórico até essa mensagem.');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId((id) => (id === messageId ? null : id)), 2000);
  }, [showError]);

  useImperativeHandle(ref, () => ({ jumpTo, focusComposer: () => composerRef.current?.focus() }));

  // --- Actions ---------------------------------------------------------------

  const prepareFiles = async (files) => {
    let imageUrl = null;
    const attachments = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(Math.round((i / files.length) * 100));
      if (file.type.startsWith('image/') && file.type !== 'image/gif') {
        const dataUrl = await compressImage(file).catch(() => null);
        if (dataUrl && !imageUrl && files.length === 1 && dataUrl.length <= INLINE_IMAGE_LIMIT_CHARS) {
          imageUrl = dataUrl;
          continue;
        }
        if (dataUrl) {
          const blob = dataUrlToBlob(dataUrl);
          const named = new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
          attachments.push(await uploadAttachment(named, user.id, attachmentScope));
          continue;
        }
      }
      attachments.push(await uploadAttachment(file, user.id, attachmentScope, (p) => {
        setUploadProgress(Math.round(((i + p / 100) / files.length) * 100));
      }));
    }
    return { imageUrl, attachments };
  };

  const handleSend = async (text, files) => {
    stopTyping();
    try {
      const { imageUrl, attachments } = files.length ? await prepareFiles(files) : { imageUrl: null, attachments: [] };
      const { ids, everyone } = scope.type === 'channel' ? extractMentions(text, membersByName) : { ids: [], everyone: false };
      await sendMessage(scope, user, {
        content: text,
        imageUrl,
        attachments,
        replyTo: replyTo
          ? { id: replyTo.id, authorId: replyTo.authorId, authorName: replyTo.authorName, content: (replyTo.content || '').slice(0, 140) }
          : null,
        mentions: ids,
        mentionEveryone: everyone && allowEveryone
      });
      setReplyTo(null);
      atBottomRef.current = true;
    } finally {
      setUploadProgress(null);
    }
  };

  const handleSaveEdit = useCallback(async (message, text) => {
    try {
      const { ids, everyone } = scope.type === 'channel' ? extractMentions(text, membersByName) : { ids: [], everyone: false };
      await editMessage(scope, message.id, text, scope.type === 'channel' ? { mentions: ids, mentionEveryone: everyone && allowEveryone } : {});
      setEditingId(null);
    } catch (err) {
      logWarn('edit message', err);
      showError('Não foi possível editar', 'Tente novamente.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, membersByName, allowEveryone, showError]);

  const handleDelete = useCallback(async (message) => {
    const ok = await showConfirm('Excluir mensagem', 'Tem certeza que deseja excluir esta mensagem?', { isDanger: true, confirmText: 'Excluir' });
    if (!ok) return;
    try {
      await deleteMessage(scope, message.id);
      if (message.authorId === user.id) message.attachments.forEach((a) => deleteAttachment(a));
    } catch (err) {
      logWarn('delete message', err);
      showError('Não foi possível excluir', 'Você não tem permissão para excluir esta mensagem.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user.id, showConfirm, showError]);

  const handleReact = useCallback((message, emoji) => {
    toggleReaction(scope, message, emoji, user.id).catch((err) => logWarn('react', err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user.id]);

  const handlePin = useCallback(async (message) => {
    try {
      await setPinned(scope, message.id, !message.pinned, user.id);
      showToast(message.pinned ? 'Mensagem desafixada.' : 'Mensagem fixada no canal.', 'success');
    } catch (err) {
      logWarn('pin', err);
      showError('Sem permissão', 'Apenas moderadores podem fixar mensagens.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user.id, showError, showToast]);

  const handleEditLast = () => {
    const mine = [...messages].reverse().find((m) => m.authorId === user.id && !m.pending);
    if (mine) setEditingId(mine.id);
  };

  const joinInvite = useCallback(async (code) => {
    try {
      const res = await onJoinInvite(code);
      showSuccess('Servidor acessado!', res?.message || '');
    } catch (err) {
      showError('Não foi possível entrar', err.message);
    }
  }, [onJoinInvite, showSuccess, showError]);

  // --- Drag & drop -------------------------------------------------------------

  const dragProps = disabledReason ? {} : {
    onDragOver: (e) => {
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
        e.preventDefault();
        setIsDragging(true);
      }
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer?.files?.length) composerRef.current?.addFiles(e.dataTransfer.files);
    }
  };

  // --- Render ----------------------------------------------------------------

  const rendered = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    if (newDay) rendered.push(<div key={`day-${m.id}`} className="day-separator"><span>{dayLabel(m.createdAt)}</span></div>);
    const grouped = !newDay && prev && prev.authorId === m.authorId && !m.replyTo
      && new Date(m.createdAt) - new Date(prev.createdAt) < GROUP_WINDOW_MS;
    rendered.push(
      <MessageItem
        key={m.id}
        message={m}
        grouped={grouped}
        me={user}
        memberNames={memberNames}
        canDelete={canModerate}
        canPin={canPin}
        isEditing={editingId === m.id}
        isHighlighted={highlightId === m.id}
        isBlockedAuthor={blockedIds.includes(m.authorId)}
        mentionsMe={(m.mentions || []).includes(user.id) || (m.mentionEveryone && m.authorId !== user.id)}
        onReply={setReplyTo}
        onStartEdit={(msg) => setEditingId(msg.id)}
        onCancelEdit={() => setEditingId(null)}
        onSaveEdit={handleSaveEdit}
        onDelete={handleDelete}
        onReact={handleReact}
        onPin={handlePin}
        onOpenImage={setLightbox}
        onJumpTo={jumpTo}
        onJoinInvite={joinInvite}
      />
    );
  });

  const typingText = typingNames.length === 0
    ? ''
    : typingNames.length > 3
      ? 'Várias pessoas estão digitando…'
      : `${typingNames.join(', ')} ${typingNames.length === 1 ? 'está digitando…' : 'estão digitando…'}`;

  return (
    <div className="chat-view" {...dragProps}>
      {isDragging && (
        <div className="drop-overlay">
          <Upload size={44} />
          <h3>Solte os arquivos para enviar</h3>
          <span>Imagens, vídeos e documentos de até 8 MB</span>
        </div>
      )}

      <div className="chat-messages" ref={listRef} onScroll={onScroll}>
        {hasMore && <div className="history-loader">Carregando mensagens anteriores…</div>}
        {!hasMore && !loading && emptyState}
        {loading && messages.length === 0 && <div className="history-loader">Carregando mensagens…</div>}
        {error && <div className="history-loader error">Não foi possível carregar as mensagens.</div>}
        {rendered}
      </div>

      {!atBottom && (
        <button className="jump-bottom" onClick={() => scrollToBottom(true)}>
          <ArrowDown size={14} /> Ir para as mensagens recentes
        </button>
      )}

      <div className="typing-indicator typing-row">{typingText}</div>

      <MessageComposer
        ref={composerRef}
        scopeKey={key}
        placeholder={placeholder}
        disabledReason={disabledReason}
        members={members.filter((m) => m.id !== user.id)}
        allowEveryone={allowEveryone}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSend={handleSend}
        onTyping={notifyTyping}
        onEditLast={handleEditLast}
        onError={(msg) => showError('Envio de mensagem', msg)}
        uploadProgress={uploadProgress}
      />

      {lightbox && <ImageLightboxModal isOpen imageUrl={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
});

export default ChatView;
