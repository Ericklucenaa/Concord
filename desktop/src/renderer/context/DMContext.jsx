import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { 
  getDMConversationId, 
  sendDirectMessageInCloud, 
  listenToDirectMessagesInCloud, 
  deleteDirectMessageFromCloud, 
  toggleDirectMessageReactionInCloud,
  sendFriendRequestInCloud,
  respondFriendRequestInCloud,
  listenToFriendsInCloud,
  removeFriendInCloud,
  findUserByNicknameInCloud
} from '../services/cloudSync';
import { showNativeNotification } from '../services/notificationService';

const DMContext = createContext(null);

export function DMProvider({ children }) {
  const { user } = useAuth();
  const [activeDM, setActiveDM] = useState(null); // target user object
  const [friendsList, setFriendsList] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [activeTab, setActiveTab] = useState('online'); // 'online' | 'all' | 'pending' | 'add'
  const [unreadDMs, setUnreadDMs] = useState(new Map());

  // Listen to Friends and Friend Requests in real-time
  useEffect(() => {
    if (!user?.id || !user?.username) {
      setFriendsList([]);
      return;
    }

    const unsub = listenToFriendsInCloud(user.username, user.id, (allFriendDocs) => {
      setFriendsList(allFriendDocs);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [user?.id, user?.username]);

  // Listen to Active DM messages in real-time
  useEffect(() => {
    if (!user?.id || !activeDM?.id) {
      setDirectMessages([]);
      return;
    }

    const dmId = getDMConversationId(user.id, activeDM.id);
    const unsub = listenToDirectMessagesInCloud(dmId, (msgs) => {
      setDirectMessages(msgs);

      // Trigger native notification if the latest message was sent by the other user and window is not focused
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (String(lastMsg.senderId) !== String(user.id)) {
          showNativeNotification(`Mensagem de @${activeDM.username}`, {
            body: lastMsg.content || (lastMsg.attachment ? 'Enviou uma imagem' : 'Nova mensagem'),
            icon: activeDM.avatar,
            tag: `dm_${activeDM.id}`
          });
        }
      }
    });

    return () => {
      if (unsub) unsub();
    };
  }, [user?.id, activeDM?.id, activeDM?.username, activeDM?.avatar]);

  const openDMWithUser = useCallback((targetUser) => {
    if (!targetUser) return;
    setActiveDM(targetUser);
  }, []);

  const closeDM = useCallback(() => {
    setActiveDM(null);
  }, []);

  const sendDirectMessage = async ({ content = '', attachment = null }) => {
    if (!user?.id || !activeDM?.id) return;
    const dmId = getDMConversationId(user.id, activeDM.id);
    const newMsg = {
      id: 'dm_msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      dmId,
      senderId: String(user.id),
      senderUsername: user.username,
      senderAvatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.username}`,
      content: content.trim(),
      attachment: attachment || null,
      reactions: {},
      createdAt: new Date().toISOString()
    };

    await sendDirectMessageInCloud(dmId, newMsg);
  };

  const deleteDirectMessage = async (messageId) => {
    await deleteDirectMessageFromCloud(messageId);
  };

  const toggleReaction = async (messageId, emoji) => {
    if (!user?.id) return;
    await toggleDirectMessageReactionInCloud(messageId, emoji, user.id);
  };

  const sendFriendRequest = async (targetNickname) => {
    if (!user) throw new Error('Usuário não autenticado.');
    return await sendFriendRequestInCloud(user, targetNickname);
  };

  const respondFriendRequest = async (requestId, action) => {
    if (!user) return;
    await respondFriendRequestInCloud(requestId, action, user);
  };

  const removeFriend = async (friendshipId) => {
    await removeFriendInCloud(friendshipId);
  };

  return (
    <DMContext.Provider
      value={{
        activeDM,
        setActiveDM,
        openDMWithUser,
        closeDM,
        friendsList,
        directMessages,
        activeTab,
        setActiveTab,
        sendDirectMessage,
        deleteDirectMessage,
        toggleReaction,
        sendFriendRequest,
        respondFriendRequest,
        removeFriend
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
