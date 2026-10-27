import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  FieldPath
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn, quietly } from '../log';
import { newId, nowIso } from './util';

const CHANNEL_MESSAGES = 'concord_messages';
const DIRECT_MESSAGES = 'concord_direct_messages';
const ACTIVITY = 'concord_channel_activity';
const MENTIONS = 'concord_mentions';
const TYPING = 'concord_typing';
const READ_STATES = 'concord_read_states';
const THREADS = 'concord_dm_threads';

export const PAGE_SIZE = 50;
export const MAX_CONTENT_LENGTH = 4000;

/**
 * A scope says where messages live:
 *   { type: 'channel', serverId, channelId }  -> concord_messages
 *   { type: 'dm', threadId }                  -> concord_direct_messages
 */
export function scopeKey(scope) {
  return scope.type === 'channel' ? scope.channelId : scope.threadId;
}

function collectionFor(scope) {
  return scope.type === 'channel' ? CHANNEL_MESSAGES : DIRECT_MESSAGES;
}

function baseQuery(scope) {
  const coll = collection(firestore, collectionFor(scope));
  return scope.type === 'channel'
    ? [coll, where('serverId', '==', scope.serverId), where('channelId', '==', scope.channelId)]
    : [coll, where('dmId', '==', scope.threadId)];
}

/** Both collections normalized to one shape for the UI. */
export function normalizeMessage(raw, scope) {
  if (scope.type === 'channel') {
    return {
      ...raw,
      authorId: raw.userId,
      authorName: raw.username,
      authorAvatar: raw.avatar,
      reactions: raw.reactions || {},
      attachments: raw.attachments || []
    };
  }
  return {
    ...raw,
    authorId: raw.senderId,
    authorName: raw.senderUsername,
    authorAvatar: raw.senderAvatar,
    imageUrl: raw.imageUrl || raw.attachment || null,
    reactions: raw.reactions || {},
    attachments: raw.attachments || []
  };
}

/**
 * Live listener over the newest `count` messages. Loading older history raises
 * `count` and re-subscribes, so edits/reactions stay live on every loaded page.
 */
export function listenToMessages(scope, count, callback, onError) {
  const q = query(...baseQuery(scope), orderBy('createdAt', 'desc'), limit(count));
  return onSnapshot(
    q,
    (snap) => {
      const messages = snap.docs.map((d) => normalizeMessage(d.data(), scope)).reverse();
      callback(messages, { hasMore: snap.docs.length >= count, fromCache: snap.metadata.fromCache });
    },
    (err) => {
      logWarn('listen messages', err);
      onError?.(err);
    }
  );
}

export function listenToPinned(scope, callback) {
  if (scope.type !== 'channel') return () => {};
  const q = query(...baseQuery(scope), where('pinned', '==', true), orderBy('createdAt', 'desc'), limit(50));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => normalizeMessage(d.data(), scope))),
    (err) => logWarn('listen pinned', err)
  );
}

/** Searches the most recent history of the given scopes (Firestore has no full-text search). */
export async function searchMessages(scopes, text, perScope = 300) {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  const results = await Promise.all(
    scopes.map(async (scope) => {
      try {
        const snap = await getDocs(query(...baseQuery(scope), orderBy('createdAt', 'desc'), limit(perScope)));
        return snap.docs
          .map((d) => ({ ...normalizeMessage(d.data(), scope), scope }))
          .filter((m) => (m.content || '').toLowerCase().includes(needle) || (m.authorName || '').toLowerCase().includes(needle));
      } catch (err) {
        logWarn('search messages', err);
        return [];
      }
    })
  );
  return results.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function preview(content, attachments, imageUrl) {
  if (content) return content.slice(0, 120);
  if (imageUrl) return '📷 Imagem';
  if (attachments?.length) return `📎 ${attachments[0].name}`;
  return '';
}

/**
 * Sends a message and updates the side documents that drive unread badges
 * and mention notifications.
 */
export async function sendMessage(scope, author, payload) {
  const content = String(payload.content || '').slice(0, MAX_CONTENT_LENGTH);
  const id = newId('msg');
  const createdAt = nowIso();
  const common = {
    id,
    content,
    imageUrl: payload.imageUrl || null,
    attachments: payload.attachments || [],
    replyTo: payload.replyTo || null,
    reactions: {},
    createdAt
  };

  if (scope.type === 'channel') {
    const mentions = (payload.mentions || []).filter((m) => m !== author.id);
    await setDoc(doc(firestore, CHANNEL_MESSAGES, id), {
      ...common,
      serverId: scope.serverId,
      channelId: scope.channelId,
      userId: author.id,
      username: author.username,
      avatar: author.avatar || '',
      mentions,
      mentionEveryone: Boolean(payload.mentionEveryone),
      pinned: false
    });

    const activity = {
      serverId: scope.serverId,
      channelId: scope.channelId,
      lastMessageAt: createdAt,
      lastMessageBy: author.id
    };
    if (payload.mentionEveryone) activity.lastEveryoneAt = createdAt;
    quietly('channel activity', setDoc(doc(firestore, ACTIVITY, scope.channelId), activity, { merge: true }));

    const text = preview(content, common.attachments, common.imageUrl);
    mentions.forEach((targetId) => {
      quietly('mention', setDoc(doc(firestore, MENTIONS, `${targetId}_${id}`), {
        targetId,
        authorId: author.id,
        authorName: author.username,
        serverId: scope.serverId,
        channelId: scope.channelId,
        messageId: id,
        preview: text,
        createdAt
      }));
    });
  } else {
    await setDoc(doc(firestore, DIRECT_MESSAGES, id), {
      ...common,
      dmId: scope.threadId,
      senderId: author.id,
      senderUsername: author.username,
      senderAvatar: author.avatar || ''
    });
    quietly('thread activity', updateDoc(doc(firestore, THREADS, scope.threadId), {
      lastMessageAt: createdAt,
      lastMessageBy: author.id,
      lastPreview: `${author.username}: ${preview(content, common.attachments, common.imageUrl)}`.slice(0, 140),
      updatedAt: createdAt
    }));
  }
  return id;
}

export async function editMessage(scope, messageId, content, { mentions, mentionEveryone } = {}) {
  const fields = { content: String(content).slice(0, MAX_CONTENT_LENGTH), editedAt: nowIso() };
  if (scope.type === 'channel') {
    if (mentions) fields.mentions = mentions;
    if (mentionEveryone !== undefined) fields.mentionEveryone = Boolean(mentionEveryone);
  }
  await updateDoc(doc(firestore, collectionFor(scope), messageId), fields);
}

export async function deleteMessage(scope, messageId) {
  await deleteDoc(doc(firestore, collectionFor(scope), messageId));
}

export async function toggleReaction(scope, message, emoji, userId) {
  const hasReacted = (message.reactions?.[emoji] || []).includes(userId);
  await updateDoc(
    doc(firestore, collectionFor(scope), message.id),
    new FieldPath('reactions', emoji),
    hasReacted ? arrayRemove(userId) : arrayUnion(userId)
  );
}

export async function setPinned(scope, messageId, pinned, userId) {
  await updateDoc(doc(firestore, CHANNEL_MESSAGES, messageId), {
    pinned: Boolean(pinned),
    pinnedBy: pinned ? userId : null,
    pinnedAt: pinned ? nowIso() : null
  });
}

// ---------------------------------------------------------------------------
// Unread tracking
// ---------------------------------------------------------------------------

export function listenToChannelActivity(serverId, callback) {
  const q = query(collection(firestore, ACTIVITY), where('serverId', '==', serverId));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => d.data())),
    (err) => logWarn('listen activity', err)
  );
}

export function listenToReadState(userId, callback) {
  return onSnapshot(
    doc(firestore, READ_STATES, userId),
    (snap) => callback(snap.exists() ? snap.data().channels || {} : {}),
    (err) => logWarn('listen read state', err)
  );
}

export async function markRead(userId, key, at = nowIso()) {
  await setDoc(doc(firestore, READ_STATES, userId), { channels: { [key]: at } }, { merge: true });
}

export function listenToMyMentions(userId, callback) {
  const q = query(collection(firestore, MENTIONS), where('targetId', '==', userId), limit(200));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ ...d.data(), docId: d.id }))),
    (err) => logWarn('listen mentions', err)
  );
}

export async function clearMentions(mentionDocs) {
  await Promise.all(mentionDocs.map((m) => quietly('clear mention', deleteDoc(doc(firestore, MENTIONS, m.docId)))));
}

// ---------------------------------------------------------------------------
// Typing indicators
// ---------------------------------------------------------------------------

const TYPING_TTL_MS = 6000;

export async function setTyping(key, user) {
  await setDoc(doc(firestore, TYPING, `${key}_${user.id}`), {
    scopeKey: key,
    userId: user.id,
    username: user.username,
    expiresAt: Date.now() + TYPING_TTL_MS
  });
}

export async function clearTyping(key, userId) {
  await deleteDoc(doc(firestore, TYPING, `${key}_${userId}`));
}

export function listenToTyping(key, myUserId, callback) {
  let latest = [];
  const emit = () => {
    const now = Date.now();
    callback(latest.filter((t) => t.userId !== myUserId && t.expiresAt > now).map((t) => t.username));
  };
  const unsub = onSnapshot(
    query(collection(firestore, TYPING), where('scopeKey', '==', key)),
    (snap) => {
      latest = snap.docs.map((d) => d.data());
      emit();
    },
    (err) => logWarn('listen typing', err)
  );
  const timer = setInterval(emit, 2000);
  return () => {
    clearInterval(timer);
    unsub();
  };
}
