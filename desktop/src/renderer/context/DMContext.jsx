import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import * as dms from '../services/cloud/dms';
import * as friends from '../services/cloud/friends';

const DMContext = createContext(null);

export function DMProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [threads, setThreads] = useState([]);
  const [friendships, setFriendships] = useState([]);
  const [blockedIds, setBlockedIds] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [activeTab, setActiveTab] = useState('online'); // 'online' | 'all' | 'pending' | 'blocked' | 'add'

  useEffect(() => {
    if (!userId) {
      setThreads([]);
      setFriendships([]);
      setBlockedIds([]);
      setActiveThreadId(null);
      return undefined;
    }
    const unsubs = [
      dms.listenToMyThreads(userId, setThreads),
      friends.listenToFriendships(userId, setFriendships),
      friends.listenToBlocks(userId, setBlockedIds)
    ];
    return () => unsubs.forEach((u) => u());
  }, [userId]);

  const described = useMemo(
    () => friendships.map((f) => friends.describeFriendship(f, userId)),
    [friendships, userId]
  );
  const friendList = useMemo(() => described.filter((f) => f.status === 'accepted'), [described]);
  const incomingRequests = useMemo(() => described.filter((f) => f.incoming), [described]);
  const outgoingRequests = useMemo(() => described.filter((f) => f.outgoing), [described]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) || null,
    [threads, activeThreadId]
  );

  // Leave the thread view if I was removed from the group. The grace period
  // covers a freshly created thread that has not reached the listener yet.
  useEffect(() => {
    if (!activeThreadId || activeThread) return undefined;
    const timer = setTimeout(() => setActiveThreadId(null), 3000);
    return () => clearTimeout(timer);
  }, [activeThreadId, activeThread]);

  const openDMWithUser = useCallback(async (target) => {
    if (!target?.id || !user) return null;
    const thread = await dms.ensureDirectThread(user, target);
    setActiveThreadId(thread.id);
    return thread;
  }, [user]);

  const openThread = useCallback((threadOrId) => {
    setActiveThreadId(typeof threadOrId === 'string' ? threadOrId : threadOrId?.id || null);
  }, []);

  const closeDM = useCallback(() => setActiveThreadId(null), []);

  const createGroup = async (members, name) => {
    const thread = await dms.createGroupThread(user, members, name);
    setActiveThreadId(thread.id);
    return thread;
  };

  const leaveGroup = async (thread) => {
    await dms.leaveGroup(thread, userId);
    if (activeThreadId === thread.id) setActiveThreadId(null);
  };

  return (
    <DMContext.Provider
      value={{
        threads,
        activeThread,
        activeThreadId,
        openThread,
        openDMWithUser,
        closeDM,
        createGroup,
        leaveGroup,
        addToGroup: dms.addGroupMembers,
        removeFromGroup: dms.removeGroupMember,
        renameGroup: dms.renameGroup,
        friendList,
        incomingRequests,
        outgoingRequests,
        activeTab,
        setActiveTab,
        sendFriendRequest: (nick) => friends.sendFriendRequest(user, nick),
        respondFriendRequest: (friendship, action) =>
          friends.respondFriendRequest(friendships.find((f) => f.id === friendship.friendshipId) || friendship, action, user),
        removeFriend: friends.removeFriendship,
        blockedIds,
        isBlocked: (id) => blockedIds.includes(id),
        blockUser: (targetId) => friends.blockUser(userId, targetId),
        unblockUser: (targetId) => friends.unblockUser(userId, targetId)
      }}
    >
      {children}
    </DMContext.Provider>
  );
}

export function useDM() {
  const ctx = useContext(DMContext);
  if (!ctx) throw new Error('useDM must be used within a DMProvider');
  return ctx;
}
