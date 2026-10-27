import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useServer } from './ServerContext';
import { useDM } from './DMContext';
import {
  listenToChannelActivity,
  listenToReadState,
  listenToMyMentions,
  markRead as markReadInCloud,
  clearMentions
} from '../services/cloud/messages';
import { canViewChannel } from '../services/permissions';
import { describeThread } from '../services/cloud/dms';
import { showNativeNotification } from '../services/notificationService';
import { soundSynthesizer } from '../services/soundEffects';
import { getSettings } from '../services/settings';
import { quietly } from '../services/log';

const UnreadContext = createContext(null);

export function UnreadProvider({ children }) {
  const { user } = useAuth();
  const { servers, goToChannel, setActiveServer } = useServer();
  const { threads, openThread, activeThreadId, blockedIds } = useDM();
  const userId = user?.id;

  const [readState, setReadState] = useState({});
  const [activity, setActivity] = useState(new Map()); // channelId -> activity doc
  const [mentions, setMentions] = useState([]);
  const startedAt = useRef(new Date().toISOString());
  const notifiedMentions = useRef(new Set());
  const threadSeen = useRef(new Map());

  useEffect(() => {
    if (!userId) {
      setReadState({});
      setMentions([]);
      return undefined;
    }
    const unsubs = [listenToReadState(userId, setReadState), listenToMyMentions(userId, setMentions)];
    return () => unsubs.forEach((u) => u());
  }, [userId]);

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

  const notifyEnabled = () => user?.status !== 'dnd';

  // Mention notifications.
  useEffect(() => {
    mentions.forEach((m) => {
      if (notifiedMentions.current.has(m.docId)) return;
      notifiedMentions.current.add(m.docId);
      if (m.createdAt < startedAt.current || !notifyEnabled() || !getSettings().notifyMentions) return;
      if (blockedIds.includes(m.authorId)) return;
      const server = servers.find((s) => s.id === m.serverId);
      const channel = server?.channels.find((c) => c.id === m.channelId);
      if (getSettings().notificationSounds) soundSynthesizer.play('notification');
      showNativeNotification(`@${m.authorName} mencionou você em #${channel?.name || 'canal'}`, {
        body: m.preview,
        tag: `mention_${m.messageId}`,
        onClick: () => goToChannel(m.serverId, m.channelId)
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentions]);

  // DM notifications.
  useEffect(() => {
    threads.forEach((t) => {
      const previous = threadSeen.current.get(t.id);
      threadSeen.current.set(t.id, t.lastMessageAt);
      if (!t.lastMessageAt || t.lastMessageAt === previous || previous === undefined && t.lastMessageAt < startedAt.current) return;
      if (t.lastMessageBy === userId || blockedIds.includes(t.lastMessageBy)) return;
      if (!notifyEnabled() || !getSettings().notifyDMs) return;
      if (t.id === activeThreadId && document.hasFocus()) return;
      const { title } = describeThread(t, userId);
      if (getSettings().notificationSounds) soundSynthesizer.play('notification');
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

  const isUnreadAt = useCallback((key, lastAt, lastBy) => {
    if (!lastAt || lastBy === userId) return false;
    const read = readState[key];
    return !read || lastAt > read;
  }, [readState, userId]);

  const isChannelUnread = useCallback((channelId) => {
    const a = activity.get(channelId);
    return Boolean(a) && isUnreadAt(channelId, a.lastMessageAt, a.lastMessageBy);
  }, [activity, isUnreadAt]);

  const channelMentionCount = useCallback((channelId) => {
    const direct = mentions.filter((m) => m.channelId === channelId).length;
    const a = activity.get(channelId);
    const everyone = a?.lastEveryoneAt && isUnreadAt(channelId, a.lastEveryoneAt, null) && a.lastMessageBy !== userId ? 1 : 0;
    return direct + everyone;
  }, [mentions, activity, isUnreadAt, userId]);

  const serverSummary = useCallback((server) => {
    let unread = false;
    let mentionCount = 0;
    (server.channels || []).forEach((c) => {
      if (c.type !== 'text' || !canViewChannel(server, userId, c.id)) return;
      if (isChannelUnread(c.id)) unread = true;
      mentionCount += channelMentionCount(c.id);
    });
    return { unread, mentionCount };
  }, [isChannelUnread, channelMentionCount, userId]);

  const isThreadUnread = useCallback(
    (thread) => isUnreadAt(thread.id, thread.lastMessageAt, thread.lastMessageBy),
    [isUnreadAt]
  );

  const unreadThreadCount = useMemo(
    () => threads.filter((t) => isThreadUnread(t) && !blockedIds.includes(t.lastMessageBy)).length,
    [threads, isThreadUnread, blockedIds]
  );

  /** Marks a channel or thread read up to `at` (defaults to now). */
  const markRead = useCallback((key, at) => {
    if (!userId || !key) return;
    const stamp = at || new Date().toISOString();
    if (readState[key] && readState[key] >= stamp) return;
    setReadState((prev) => ({ ...prev, [key]: stamp }));
    quietly('mark read', markReadInCloud(userId, key, stamp));
    const cleared = mentions.filter((m) => m.channelId === key);
    if (cleared.length > 0) {
      setMentions((prev) => prev.filter((m) => m.channelId !== key));
      clearMentions(cleared);
    }
  }, [userId, readState, mentions]);

  return (
    <UnreadContext.Provider
      value={{
        isChannelUnread,
        channelMentionCount,
        serverSummary,
        isThreadUnread,
        unreadThreadCount,
        markRead,
        readState
      }}
    >
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}
