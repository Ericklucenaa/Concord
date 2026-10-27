import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useServer } from './ServerContext';
import { useDM } from './DMContext';
import {
  listenToChannelActivity,
  listenToReadState,
  listenToMyMentions,
  markRead as markReadInCloud,
  markMentionsRead
} from '../services/cloud/messages';
import {
  listenToNotificationPrefs,
  setMuted as saveMuted,
  setServerNotify as saveServerNotify,
  isMutedNow,
  EMPTY_PREFS
} from '../services/cloud/userSettings';
import { canViewChannel } from '../services/permissions';
import { describeThread } from '../services/cloud/dms';
import { showNativeNotification } from '../services/notificationService';
import { soundSynthesizer } from '../services/soundEffects';
import { getSettings } from '../services/settings';
import { quietly } from '../services/log';

const UnreadContext = createContext(null);

/** Small red badge drawn on a canvas, used as the Windows taskbar overlay icon. */
function badgeDataUrl(count) {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f43f5e';
  ctx.beginPath();
  ctx.arc(16, 16, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count > 9 ? '9+' : String(count), 16, 17);
  return canvas.toDataURL('image/png');
}

export function UnreadProvider({ children }) {
  const { user } = useAuth();
  const { servers, goToChannel, setActiveServer, activeChannel } = useServer();
  const { threads, openThread, activeThreadId, blockedIds } = useDM();
  const userId = user?.id;

  const [readState, setReadState] = useState({});
  const [activity, setActivity] = useState(new Map()); // channelId -> activity doc
  const [mentions, setMentions] = useState([]);
  const [prefs, setPrefs] = useState(EMPTY_PREFS);
  const [tick, setTick] = useState(0);
  const startedAt = useRef(new Date().toISOString());
  const notifiedMentions = useRef(new Set());
  const threadSeen = useRef(new Map());
  const activitySeen = useRef(new Map());

  useEffect(() => {
    if (!userId) {
      setReadState({});
      setMentions([]);
      setPrefs(EMPTY_PREFS);
      return undefined;
    }
    const unsubs = [
      listenToReadState(userId, setReadState),
      listenToMyMentions(userId, setMentions),
      listenToNotificationPrefs(userId, setPrefs)
    ];
    return () => unsubs.forEach((u) => u());
  }, [userId]);

  // Timed mutes expire on their own.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const serverIdsKey = servers.map((s) => s.id).sort().join(',');
  useEffect(() => {
    if (!serverIdsKey) {
      setActivity(new Map());
      return undefined;
    }
    const perServer = new Map();
    const unsubs = serverIdsKey.split(',').map((serverId) =>
      listenToChannelActivity(serverId, (docs) => {
        perServer.set(serverId, docs);
        const merged = new Map();
        perServer.forEach((list) => list.forEach((a) => merged.set(a.channelId, a)));
        setActivity(merged);
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [serverIdsKey]);

  // --- Mute / notification level ---------------------------------------------

  const isChannelMuted = useCallback((channelId) => isMutedNow(prefs.mutedChannels, channelId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs, tick]);
  const isServerMuted = useCallback((serverId) => isMutedNow(prefs.mutedServers, serverId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs, tick]);
  const serverNotifyLevel = useCallback((serverId) => prefs.serverNotify?.[serverId] || 'mentions', [prefs]);

  const muteChannel = (channelId, duration) => quietly('mute channel', saveMuted(userId, 'channel', channelId, duration));
  const muteServer = (serverId, duration) => quietly('mute server', saveMuted(userId, 'server', serverId, duration));
  const setServerNotify = (serverId, level) => quietly('server notify', saveServerNotify(userId, serverId, level));

  const notifyEnabled = () => user?.status !== 'dnd';
  const serverOf = (serverId) => servers.find((s) => s.id === serverId);

  // --- Notifications --------------------------------------------------------------

  useEffect(() => {
    mentions.forEach((m) => {
      if (notifiedMentions.current.has(m.docId)) return;
      notifiedMentions.current.add(m.docId);
      if (m.read || m.createdAt < startedAt.current || !notifyEnabled() || !getSettings().notifyMentions) return;
      if (blockedIds.includes(m.authorId) || isServerMuted(m.serverId) || serverNotifyLevel(m.serverId) === 'none') return;
      const channel = serverOf(m.serverId)?.channels.find((c) => c.id === m.channelId);
      if (getSettings().notificationSounds) soundSynthesizer.play('notification');
      window.electronAPI?.flashFrame?.();
      showNativeNotification(`@${m.authorName} mencionou você em #${channel?.name || 'canal'}`, {
        body: m.preview,
        tag: `mention_${m.messageId}`,
        onClick: () => goToChannel(m.serverId, m.channelId)
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentions]);

  // Servers set to "all messages" notify on any new activity.
  useEffect(() => {
    activity.forEach((a, channelId) => {
      const previous = activitySeen.current.get(channelId);
      activitySeen.current.set(channelId, a.lastMessageAt);
      if (!previous || previous === a.lastMessageAt || a.lastMessageBy === userId) return;
      if (serverNotifyLevel(a.serverId) !== 'all' || isServerMuted(a.serverId) || isChannelMuted(channelId)) return;
      if (!notifyEnabled() || (activeChannel?.id === channelId && document.hasFocus())) return;
      const server = serverOf(a.serverId);
      const channel = server?.channels.find((c) => c.id === channelId);
      if (!channel || !canViewChannel(server, userId, channelId)) return;
      showNativeNotification(`#${channel.name} — ${server.name}`, {
        body: 'Nova mensagem',
        tag: `chan_${channelId}`,
        onClick: () => goToChannel(a.serverId, channelId)
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  useEffect(() => {
    threads.forEach((t) => {
      const previous = threadSeen.current.get(t.id);
      threadSeen.current.set(t.id, t.lastMessageAt);
      if (!t.lastMessageAt || t.lastMessageAt === previous || (previous === undefined && t.lastMessageAt < startedAt.current)) return;
      if (t.lastMessageBy === userId || blockedIds.includes(t.lastMessageBy) || isChannelMuted(t.id)) return;
      if (!notifyEnabled() || !getSettings().notifyDMs) return;
      if (t.id === activeThreadId && document.hasFocus()) return;
      const { title } = describeThread(t, userId);
      if (getSettings().notificationSounds) soundSynthesizer.play('notification');
      window.electronAPI?.flashFrame?.();
      showNativeNotification(t.isGroup ? title : `Mensagem de @${title}`, {
        body: t.lastPreview || '',
        tag: `dm_${t.id}`,
        onClick: () => {
          setActiveServer(null);
          openThread(t.id);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads]);

  // --- Unread state ---------------------------------------------------------------

  const isUnreadAt = useCallback((key, lastAt, lastBy) => {
    if (!lastAt || lastBy === userId) return false;
    const read = readState[key];
    return !read || lastAt > read;
  }, [readState, userId]);

  const isChannelUnread = useCallback((channelId) => {
    const a = activity.get(channelId);
    return Boolean(a) && isUnreadAt(channelId, a.lastMessageAt, a.lastMessageBy);
  }, [activity, isUnreadAt]);

  const unreadMentions = useMemo(
    () => mentions.filter((m) => !m.read && !blockedIds.includes(m.authorId)),
    [mentions, blockedIds]
  );

  const channelMentionCount = useCallback((channelId) => {
    const direct = unreadMentions.filter((m) => m.channelId === channelId).length;
    const a = activity.get(channelId);
    const everyone = a?.lastEveryoneAt && isUnreadAt(channelId, a.lastEveryoneAt, null) && a.lastMessageBy !== userId ? 1 : 0;
    return direct + everyone;
  }, [unreadMentions, activity, isUnreadAt, userId]);

  const serverSummary = useCallback((server) => {
    let unread = false;
    let mentionCount = 0;
    const muted = isServerMuted(server.id);
    (server.channels || []).forEach((c) => {
      if (c.type !== 'text' || !canViewChannel(server, userId, c.id)) return;
      if (!muted && !isChannelMuted(c.id) && isChannelUnread(c.id)) unread = true;
      mentionCount += channelMentionCount(c.id);
    });
    return { unread, mentionCount, muted };
  }, [isChannelUnread, channelMentionCount, userId, isServerMuted, isChannelMuted]);

  const isThreadUnread = useCallback(
    (thread) => isUnreadAt(thread.id, thread.lastMessageAt, thread.lastMessageBy),
    [isUnreadAt]
  );

  const unreadThreadCount = useMemo(
    () => threads.filter((t) => isThreadUnread(t) && !blockedIds.includes(t.lastMessageBy) && !isMutedNow(prefs.mutedChannels, t.id)).length,
    [threads, isThreadUnread, blockedIds, prefs]
  );

  // Taskbar overlay badge + window title with what needs attention.
  const attentionCount = unreadMentions.length + unreadThreadCount;
  useEffect(() => {
    document.title = attentionCount > 0 ? `(${attentionCount}) Concord` : 'Concord';
    window.electronAPI?.setBadge?.(attentionCount, attentionCount > 0 ? badgeDataUrl(attentionCount) : null);
  }, [attentionCount]);

  /**
   * Marks a channel or thread read up to `at` (defaults to now). `force`
   * allows moving the marker back ("marcar como não lida").
   */
  const markRead = useCallback((key, at, { force = false } = {}) => {
    if (!userId || !key) return;
    const stamp = at || new Date().toISOString();
    if (!force && readState[key] && readState[key] >= stamp) return;
    setReadState((prev) => ({ ...prev, [key]: stamp }));
    quietly('mark read', markReadInCloud(userId, key, stamp));
    if (force) return;
    const toMark = mentions.filter((m) => m.channelId === key && !m.read);
    if (toMark.length > 0) {
      setMentions((prev) => prev.map((m) => (m.channelId === key ? { ...m, read: true } : m)));
      quietly('mentions read', markMentionsRead(toMark));
    }
  }, [userId, readState, mentions]);

  const markServerRead = useCallback((server) => {
    server.channels.filter((c) => c.type === 'text').forEach((c) => {
      if (isChannelUnread(c.id)) markRead(c.id);
    });
  }, [isChannelUnread, markRead]);

  return (
    <UnreadContext.Provider
      value={{
        isChannelUnread,
        channelMentionCount,
        serverSummary,
        isThreadUnread,
        unreadThreadCount,
        markRead,
        markServerRead,
        readState,
        mentions,
        unreadMentions,
        isChannelMuted,
        isServerMuted,
        serverNotifyLevel,
        muteChannel,
        muteServer,
        setServerNotify
      }}
    >
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}
