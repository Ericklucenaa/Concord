import { 
  firestore,
  auth
} from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  arrayUnion, 
  deleteDoc,
  onSnapshot,
  orderBy,
  limit
} from 'firebase/firestore';

/**
 * CloudSync provides seamless multi-device persistence across Firebase Hosting
 * ensuring servers, channels, real invites and unique nicknames are shared in real-time.
 */

export async function syncUserToCloud(user) {
  if (!user || !user.id) return;
  try {
    const cleanNick = (user.username || '').trim().replace(/^@/, '');
    const userDocRef = doc(firestore, 'concord_users', String(user.id));
    await setDoc(userDocRef, {
      id: String(user.id),
      username: cleanNick,
      email: user.email || '',
      avatar: user.avatar || '',
      status: user.status || 'online',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    if (cleanNick) {
      const nickDocRef = doc(firestore, 'concord_nicknames', cleanNick.toLowerCase());
      await setDoc(nickDocRef, {
        userId: String(user.id),
        username: cleanNick,
        avatar: user.avatar || '',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (err) {}
}

export async function findUserByNicknameInCloud(queryTerm) {
  if (!queryTerm) return null;
  const cleanInput = queryTerm.trim().replace(/^@/, '');
  
  // If user searched with tag: e.g. "Lucas#1042" or "#1042"
  let targetNick = cleanInput.toLowerCase();
  let targetTag = null;
  if (cleanInput.includes('#')) {
    const parts = cleanInput.split('#');
    targetNick = parts[0].trim().toLowerCase();
    targetTag = parts[1].trim().toUpperCase();
  }

  try {
    const usersColl = collection(firestore, 'concord_users');
    const snap = await getDocs(usersColl);
    let matchedUser = null;

    snap.forEach((docSnap) => {
      const u = docSnap.data();
      if (!u) return;
      const uName = (u.username || '').toLowerCase();
      const uTag = (u.userTag || (u.id ? String(u.id).substring(0, 4) : '')).toUpperCase();

      if (targetTag && !targetNick) {
        // Searched by "#TAG"
        if (uTag === targetTag || String(u.id).toUpperCase().startsWith(targetTag)) {
          matchedUser = u;
        }
      } else if (targetTag && targetNick) {
        // Searched by "Name#TAG"
        if (uName === targetNick && (uTag === targetTag || String(u.id).toUpperCase().startsWith(targetTag))) {
          matchedUser = u;
        }
      } else if (uName === targetNick) {
        // Searched by "Name"
        matchedUser = u;
      }
    });

    if (matchedUser) return matchedUser;

    // Fallback: check nicknames registry
    if (targetNick) {
      const nickDocRef = doc(firestore, 'concord_nicknames', targetNick);
      const nickSnap = await getDoc(nickDocRef);
      if (nickSnap.exists()) {
        return nickSnap.data();
      }
    }
  } catch (err) {}
  return null;
}

export async function saveServerToCloud(server) {
  if (!server || !server.id) return;
  try {
    const serverRef = doc(firestore, 'concord_servers', String(server.id));
    let members = server.members || [];
    if (members.length === 0 && server.ownerId) {
      members = [{
        id: String(server.ownerId),
        role: 'owner',
        status: 'online'
      }];
    }
    await setDoc(serverRef, {
      id: String(server.id),
      name: server.name || 'Servidor Concord',
      description: server.description || '',
      icon: server.icon || '',
      ownerId: server.ownerId || '',
      channels: server.channels || [],
      members: members,
      inviteCodes: server.inviteCodes || [],
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {}
}

export async function getServerFromCloud(serverId) {
  if (!serverId) return null;
  try {
    const serverRef = doc(firestore, 'concord_servers', String(serverId));
    const snap = await getDoc(serverRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {}
  return null;
}

export async function deleteServerFromCloud(serverId) {
  if (!serverId) return;
  try {
    const serverRef = doc(firestore, 'concord_servers', String(serverId));
    await deleteDoc(serverRef);
  } catch (err) {}
}

export async function leaveServerInCloud(serverId, currentUser) {
  if (!serverId || !currentUser) return;
  try {
    const serverRef = doc(firestore, 'concord_servers', String(serverId));
    const snap = await getDoc(serverRef);
    if (!snap.exists()) return;

    const serverData = snap.data();
    let members = (serverData.members || []).filter(
      (m) => String(m.id) !== String(currentUser.id) && m.username?.toLowerCase() !== currentUser.username?.toLowerCase()
    );

    // If no members left, delete the server document from Firestore
    if (members.length === 0) {
      await deleteDoc(serverRef);
    } else {
      let ownerId = serverData.ownerId;
      if (String(ownerId) === String(currentUser.id)) {
        ownerId = members[0].id;
        members[0].role = 'owner';
      }
      await updateDoc(serverRef, { members, ownerId, updatedAt: new Date().toISOString() });
    }
  } catch (err) {}
}

export async function getUserServersFromCloud(userId, username) {
  if (!userId && !username) return [];
  const result = [];
  try {
    const q = collection(firestore, 'concord_servers');
    const snapshot = await getDocs(q);
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data) return;
      const isMember = (data.members || []).some(
        (m) => m && ((userId && String(m.id) === String(userId)) || (username && m.username && m.username.toLowerCase() === username.toLowerCase()))
      );
      const isOwner = (userId && data.ownerId && String(data.ownerId) === String(userId));
      if (isMember || isOwner) {
        result.push(data);
      }
    });
  } catch (err) {}
  return result;
}

export async function saveInviteToCloud(invite) {
  if (!invite || !invite.code) return;
  try {
    const cleanCode = invite.code.trim().toUpperCase();
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://concord-3af70.web.app';
    const inviteLink = `${origin}/#invite=${cleanCode}`;

    const inviteData = {
      ...invite,
      code: cleanCode,
      inviteLink,
      createdAt: invite.createdAt || new Date().toISOString()
    };

    const inviteRef = doc(firestore, 'concord_invites', cleanCode);
    await setDoc(inviteRef, inviteData, { merge: true });

    // If targeted to a specific username
    if (invite.receiverUsername) {
      const cleanReceiver = invite.receiverUsername.trim().toLowerCase().replace(/^@/, '');
      const inviteId = invite.id || ('inv_' + Date.now());
      const userInviteRef1 = doc(firestore, 'concord_user_invites', `${cleanReceiver}_${cleanCode}`);
      const userInviteRef2 = doc(firestore, 'concord_user_invites', `${cleanReceiver}_${inviteId}`);

      const userInvitePayload = {
        ...inviteData,
        id: inviteId,
        receiverUsername: cleanReceiver,
        status: 'pending'
      };

      await setDoc(userInviteRef1, userInvitePayload, { merge: true });
      if (inviteId !== cleanCode) {
        await setDoc(userInviteRef2, userInvitePayload, { merge: true }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Error saving invite to cloud:', err);
  }
}

export async function getInviteByCodeFromCloud(code) {
  if (!code) return null;
  const cleanCode = code.trim().toUpperCase();
  try {
    const inviteRef = doc(firestore, 'concord_invites', cleanCode);
    const snap = await getDoc(inviteRef);
    if (snap.exists()) {
      const inviteData = snap.data();
      const realServer = await getServerFromCloud(inviteData.serverId);
      return {
        invite: inviteData,
        server: realServer
      };
    }
  } catch (err) {}
  return null;
}

export async function joinServerInCloud(serverId, currentUser) {
  if (!serverId || !currentUser) return null;
  try {
    const serverRef = doc(firestore, 'concord_servers', String(serverId));
    const snap = await getDoc(serverRef);
    if (!snap.exists()) return null;

    const serverData = snap.data();
    const members = serverData.members || [];
    const alreadyMember = members.some((m) => String(m.id) === String(currentUser.id));

    if (!alreadyMember) {
      const newMember = {
        id: String(currentUser.id),
        username: currentUser.username,
        avatar: currentUser.avatar,
        status: 'online',
        role: 'member'
      };
      members.push(newMember);
      await updateDoc(serverRef, { members });
      serverData.members = members;
    }

    return serverData;
  } catch (err) {
    return null;
  }
}

export async function getPendingInvitesFromCloud(username) {
  if (!username) return [];
  const cleanReceiver = username.trim().toLowerCase().replace(/^@/, '');
  const list = [];
  try {
    const q = query(
      collection(firestore, 'concord_user_invites'),
      where('receiverUsername', '==', cleanReceiver),
      where('status', '==', 'pending')
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });
  } catch (err) {}
  return list;
}

export function listenToPendingInvitesFromCloud(username, callback) {
  if (!username) return () => {};
  const cleanReceiver = username.trim().toLowerCase().replace(/^@/, '');
  try {
    const q = query(
      collection(firestore, 'concord_user_invites'),
      where('receiverUsername', '==', cleanReceiver),
      where('status', '==', 'pending')
    );
    return onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      callback(list);
    }, (err) => {
      console.warn('listenToPendingInvites error:', err);
    });
  } catch (err) {
    return () => {};
  }
}

export async function respondInviteInCloud(inviteId, action, currentUser) {
  if (!inviteId) return;
  try {
    const cleanReceiver = (currentUser?.username || '').trim().toLowerCase().replace(/^@/, '');
    const cleanCode = String(inviteId).replace(/^.*_/, '').toUpperCase();

    const userInviteRef1 = doc(firestore, 'concord_user_invites', `${cleanReceiver}_${inviteId}`);
    const userInviteRef2 = doc(firestore, 'concord_user_invites', `${cleanReceiver}_${cleanCode}`);
    
    if (action === 'accept') {
      await setDoc(userInviteRef1, { status: 'accepted' }, { merge: true }).catch(() => {});
      await setDoc(userInviteRef2, { status: 'accepted' }, { merge: true }).catch(() => {});
    } else {
      await deleteDoc(userInviteRef1).catch(() => {});
      await deleteDoc(userInviteRef2).catch(() => {});
    }
  } catch (err) {}
}

export async function saveMessageToCloud(channelId, message) {
  if (!channelId || !message) return;
  try {
    const msgRef = doc(firestore, 'concord_messages', String(message.id));
    await setDoc(msgRef, {
      ...message,
      channelId: String(channelId),
      createdAt: message.createdAt || new Date().toISOString()
    });
  } catch (err) {}
}

export async function deleteMessageFromCloud(messageId) {
  if (!messageId) return;
  try {
    const msgRef = doc(firestore, 'concord_messages', String(messageId));
    await deleteDoc(msgRef);
  } catch (err) {}
}

export function listenToMessagesFromCloud(channelId, callback) {
  if (!channelId) return () => {};
  try {
    const q = query(
      collection(firestore, 'concord_messages'),
      where('channelId', '==', String(channelId))
    );
    return onSnapshot(q, (snapshot) => {
      const messages = [];
      snapshot.forEach((docSnap) => {
        messages.push(docSnap.data());
      });
      messages.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      callback(messages);
    }, (err) => {
      // Handled silently
    });
  } catch (err) {
    return () => {};
  }
}

export async function joinVoiceInCloud(channelId, userInfo) {
  if (!channelId || !userInfo) return;
  try {
    const roomRef = doc(firestore, 'concord_voice_rooms', String(channelId));
    const snap = await getDoc(roomRef);
    let users = [];
    if (snap && snap.exists()) {
      users = snap.data().users || [];
    }
    // Filter out existing entries for this user by userId or username
    users = users.filter((u) => {
      if (!u) return false;
      if (userInfo.userId && String(u.userId) === String(userInfo.userId)) return false;
      if (userInfo.username && u.username && u.username.toLowerCase() === userInfo.username.toLowerCase()) return false;
      return true;
    });
    users.push(userInfo);
    await setDoc(roomRef, { users, updatedAt: new Date().toISOString() }, { merge: true });
    
    window.dispatchEvent(new CustomEvent('concord:voice_update', { detail: { channelId, users } }));
  } catch (err) {
    window.dispatchEvent(new CustomEvent('concord:voice_update', { detail: { channelId, users: [userInfo] } }));
  }
}

export async function leaveVoiceInCloud(channelId, userId, username) {
  if (!channelId) return;
  try {
    const roomRef = doc(firestore, 'concord_voice_rooms', String(channelId));
    const snap = await getDoc(roomRef);
    if (snap && snap.exists()) {
      let users = snap.data().users || [];
      users = users.filter((u) => {
        if (!u) return false;
        if (userId && String(u.userId) === String(userId)) return false;
        if (username && u.username && u.username.toLowerCase() === username.toLowerCase()) return false;
        return true;
      });
      let activePresenter = snap.data().activePresenter || null;
      if (activePresenter && (String(activePresenter.userId) === String(userId) || activePresenter.username === username)) {
        activePresenter = null;
      }

      if (users.length === 0) {
        await deleteDoc(roomRef);
      } else {
        await setDoc(roomRef, { users, activePresenter, updatedAt: new Date().toISOString() });
      }
      window.dispatchEvent(new CustomEvent('concord:voice_update', { detail: { channelId, users, activePresenter } }));
    }
  } catch (err) {
    window.dispatchEvent(new CustomEvent('concord:voice_update', { detail: { channelId, users: [] } }));
  }
}

export async function updateVoiceScreenSharingInCloud(channelId, userId, isScreenSharing, presenterData = null) {
  if (!channelId || !userId) return;
  try {
    const roomRef = doc(firestore, 'concord_voice_rooms', String(channelId));
    const snap = await getDoc(roomRef);
    if (snap && snap.exists()) {
      let users = snap.data().users || [];
      users = users.map((u) => {
        if (String(u.userId) === String(userId) || (presenterData?.username && u.username === presenterData.username)) {
          return { ...u, isScreenSharing: Boolean(isScreenSharing) };
        }
        return u;
      });
      const activePresenter = isScreenSharing ? presenterData : null;
      await setDoc(roomRef, { users, activePresenter, updatedAt: new Date().toISOString() }, { merge: true });
      window.dispatchEvent(new CustomEvent('concord:voice_update', { detail: { channelId, users, activePresenter } }));
    }
  } catch (err) {}
}

export async function updateVoiceUserStateInCloud(channelId, userId, { isMuted, isDeafened, isSpeaking, username, avatar } = {}) {
  if (!channelId || !userId) return;
  try {
    const roomRef = doc(firestore, 'concord_voice_rooms', String(channelId));
    const snap = await getDoc(roomRef);
    if (snap && snap.exists()) {
      let users = snap.data().users || [];
      users = users.map((u) => {
        if (String(u.userId) === String(userId) || (username && u.username === username)) {
          return {
            ...u,
            ...(isMuted !== undefined ? { isMuted: Boolean(isMuted) } : {}),
            ...(isDeafened !== undefined ? { isDeafened: Boolean(isDeafened) } : {}),
            ...(isSpeaking !== undefined ? { isSpeaking: Boolean(isSpeaking) } : {}),
            ...(username ? { username } : {}),
            ...(avatar ? { avatar } : {})
          };
        }
        return u;
      });
      const activePresenter = snap.data().activePresenter || null;
      await setDoc(roomRef, { users, updatedAt: new Date().toISOString() }, { merge: true });
      window.dispatchEvent(new CustomEvent('concord:voice_update', { detail: { channelId, users, activePresenter } }));
    }
  } catch (err) {}
}

export async function switchVoiceRoomInCloud(newChannelId, userInfo, allServerVoiceChannelIds = []) {
  if (!userInfo) return;
  for (const otherChId of allServerVoiceChannelIds) {
    if (String(otherChId) !== String(newChannelId)) {
      await leaveVoiceInCloud(otherChId, userInfo.userId, userInfo.username);
    }
  }
  if (newChannelId) {
    await joinVoiceInCloud(newChannelId, userInfo);
  }
}

export function listenToVoiceRoomInCloud(channelId, callback) {
  if (!channelId) return () => {};
  try {
    const roomRef = doc(firestore, 'concord_voice_rooms', String(channelId));
    return onSnapshot(roomRef, (snap) => {
      if (snap && snap.exists()) {
        const data = snap.data();
        callback(data.users || [], data.activePresenter || null);
      } else {
        callback([], null);
      }
    }, (err) => {
      // Handled silently
    });
  } catch (err) {
    return () => {};
  }
}

export async function setUserPresenceInCloud(userId, username, status = 'online') {
  if (!userId) return;
  try {
    const userDocRef = doc(firestore, 'concord_users', String(userId));
    await setDoc(userDocRef, {
      id: String(userId),
      username: username || 'Usuário',
      status: status,
      lastSeen: new Date().toISOString()
    }, { merge: true });
  } catch (err) {}
}

export function listenToUserPresenceInCloud(callback) {
  try {
    const q = collection(firestore, 'concord_users');
    return onSnapshot(q, (snapshot) => {
      const statusMap = new Map();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && data.id) {
          statusMap.set(String(data.id), data.status || 'offline');
          if (data.username) {
            statusMap.set(data.username.toLowerCase(), data.status || 'offline');
          }
        }
      });
      callback(statusMap);
    }, (err) => {});
  } catch (err) {
    return () => {};
  }
}

export async function sendScreenSignalInCloud(channelId, fromUserId, toUserId, type, data) {
  if (!fromUserId || !toUserId || !type) return;
  try {
    const signalId = `${fromUserId}_${toUserId}_${type}_${Date.now()}`;
    const signalRef = doc(firestore, 'concord_screen_signals', signalId);
    await setDoc(signalRef, {
      channelId: String(channelId || ''),
      fromUserId: String(fromUserId),
      toUserId: String(toUserId),
      type,
      data: JSON.stringify(data),
      createdAt: Date.now()
    });
  } catch (err) {}
}

export function listenToScreenSignalsInCloud(myUserId, callback) {
  if (!myUserId) return () => {};
  try {
    const q = query(
      collection(firestore, 'concord_screen_signals'),
      where('toUserId', '==', String(myUserId))
    );
    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const docData = change.doc.data();
          if (docData && docData.data) {
            try {
              const parsedData = JSON.parse(docData.data);
              callback({
                fromUserId: docData.fromUserId,
                type: docData.type,
                data: parsedData,
                channelId: docData.channelId
              });
              deleteDoc(change.doc.ref).catch(() => {});
            } catch (e) {}
          }
        }
      });
    }, (err) => {});
  } catch (err) {
    return () => {};
  }
}

export async function sendSoundboardInCloud(channelId, userId, username, soundId) {
  if (!channelId || !soundId) return;
  try {
    const soundEventId = `${channelId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const soundDocRef = doc(firestore, 'concord_soundboard', soundEventId);
    await setDoc(soundDocRef, {
      channelId: String(channelId),
      userId: String(userId || ''),
      username: username || 'Usuário',
      soundId: soundId,
      createdAt: Date.now()
    });
  } catch (err) {}
}

export function listenToSoundboardInCloud(channelId, onSound) {
  if (!channelId) return () => {};
  try {
    const q = query(
      collection(firestore, 'concord_soundboard'),
      where('channelId', '==', String(channelId))
    );
    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data && data.soundId) {
            onSound(data);
            deleteDoc(change.doc.ref).catch(() => {});
          }
        }
      });
    }, (err) => {});
  } catch (err) {
    return () => {};
  }
}

export async function toggleMessageReactionInCloud(messageId, emoji, userId, username) {
  if (!messageId || !emoji || !userId) return;
  try {
    const msgRef = doc(firestore, 'concord_messages', String(messageId));
    const snap = await getDoc(msgRef);
    if (snap && snap.exists()) {
      const data = snap.data();
      const reactions = data.reactions || {}; // { "❤️": ["user1", "user2"] }
      const currentUsers = reactions[emoji] || [];
      const hasReacted = currentUsers.includes(String(userId));

      let updatedUsers = [];
      if (hasReacted) {
        updatedUsers = currentUsers.filter((uid) => uid !== String(userId));
      } else {
        updatedUsers = [...currentUsers, String(userId)];
      }

      const updatedReactions = { ...reactions };
      if (updatedUsers.length > 0) {
        updatedReactions[emoji] = updatedUsers;
      } else {
        delete updatedReactions[emoji];
      }

      await setDoc(msgRef, { reactions: updatedReactions }, { merge: true });
    }
  } catch (err) {}
}

/**
 * =========================================================================
 * DIRECT MESSAGES (1-ON-1 DMS) & FRIENDS SYSTEM
 * =========================================================================
 */

export function getDMConversationId(userId1, userId2) {
  const ids = [String(userId1), String(userId2)].sort();
  return `dm_${ids[0]}_${ids[1]}`;
}

export async function sendDirectMessageInCloud(dmId, message) {
  if (!dmId || !message) return;
  try {
    const msgRef = doc(firestore, 'concord_direct_messages', String(message.id));
    await setDoc(msgRef, {
      ...message,
      dmId: String(dmId),
      createdAt: message.createdAt || new Date().toISOString()
    });
  } catch (err) {
    console.error('Error sending direct message in cloud:', err);
  }
}

export function listenToDirectMessagesInCloud(dmId, callback) {
  if (!dmId) return () => {};
  try {
    const q = query(
      collection(firestore, 'concord_direct_messages'),
      where('dmId', '==', String(dmId))
    );
    return onSnapshot(q, (snapshot) => {
      const messages = [];
      snapshot.forEach((docSnap) => {
        messages.push({ id: docSnap.id, ...docSnap.data() });
      });
      messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      callback(messages);
    }, (err) => {});
  } catch (err) {
    return () => {};
  }
}

export async function deleteDirectMessageFromCloud(messageId) {
  if (!messageId) return;
  try {
    const msgRef = doc(firestore, 'concord_direct_messages', String(messageId));
    await deleteDoc(msgRef);
  } catch (err) {}
}

export async function toggleDirectMessageReactionInCloud(messageId, emoji, userId) {
  if (!messageId || !emoji || !userId) return;
  try {
    const msgRef = doc(firestore, 'concord_direct_messages', String(messageId));
    const snap = await getDoc(msgRef);
    if (snap && snap.exists()) {
      const data = snap.data();
      const reactions = data.reactions || {};
      const currentUsers = reactions[emoji] || [];
      const hasReacted = currentUsers.includes(String(userId));

      let updatedUsers = [];
      if (hasReacted) {
        updatedUsers = currentUsers.filter((uid) => uid !== String(userId));
      } else {
        updatedUsers = [...currentUsers, String(userId)];
      }

      const updatedReactions = { ...reactions };
      if (updatedUsers.length > 0) {
        updatedReactions[emoji] = updatedUsers;
      } else {
        delete updatedReactions[emoji];
      }

      await setDoc(msgRef, { reactions: updatedReactions }, { merge: true });
    }
  } catch (err) {}
}

export async function sendFriendRequestInCloud(fromUser, targetNickname) {
  if (!fromUser || !targetNickname) throw new Error('Informe o apelido do amigo.');
  const cleanTarget = targetNickname.trim().replace(/^@/, '').toLowerCase();
  const cleanFromNick = (fromUser.username || '').trim().replace(/^@/, '').toLowerCase();

  if (cleanTarget === cleanFromNick) {
    throw new Error('Você não pode adicionar seu próprio perfil como amigo.');
  }

  // Look up friend in cloud
  const targetUser = await findUserByNicknameInCloud(cleanTarget);
  const friendId = `${cleanFromNick}_to_${cleanTarget}`;
  const friendRef = doc(firestore, 'concord_friends', friendId);

  const requestPayload = {
    id: friendId,
    senderId: String(fromUser.id),
    senderUsername: fromUser.username,
    senderAvatar: fromUser.avatar || '',
    receiverNickname: cleanTarget,
    receiverId: targetUser?.id || targetUser?.userId || '',
    receiverUsername: targetUser?.username || targetNickname,
    receiverAvatar: targetUser?.avatar || '',
    status: 'pending', // 'pending' | 'accepted'
    updatedAt: new Date().toISOString()
  };

  await setDoc(friendRef, requestPayload, { merge: true });
  return requestPayload;
}

export async function respondFriendRequestInCloud(requestId, action, currentUser) {
  if (!requestId) return;
  try {
    const friendRef = doc(firestore, 'concord_friends', String(requestId));
    if (action === 'accept') {
      await setDoc(friendRef, {
        status: 'accepted',
        receiverId: String(currentUser?.id || ''),
        receiverUsername: currentUser?.username || '',
        receiverAvatar: currentUser?.avatar || '',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } else {
      await deleteDoc(friendRef);
    }
  } catch (err) {}
}

export function listenToFriendsInCloud(myUsername, myUserId, callback) {
  if (!myUsername && !myUserId) return () => {};
  const cleanNick = (myUsername || '').trim().replace(/^@/, '').toLowerCase();

  try {
    const q1 = query(
      collection(firestore, 'concord_friends'),
      where('receiverNickname', '==', cleanNick)
    );
    const q2 = query(
      collection(firestore, 'concord_friends'),
      where('senderId', '==', String(myUserId))
    );

    let list1 = [];
    let list2 = [];

    const mergeAndEmit = () => {
      const map = new Map();
      [...list1, ...list2].forEach((f) => map.set(f.id, f));
      callback(Array.from(map.values()));
    };

    const unsub1 = onSnapshot(q1, (snap) => {
      list1 = [];
      snap.forEach((d) => list1.push({ id: d.id, ...d.data() }));
      mergeAndEmit();
    }, () => {});

    const unsub2 = onSnapshot(q2, (snap) => {
      list2 = [];
      snap.forEach((d) => list2.push({ id: d.id, ...d.data() }));
      mergeAndEmit();
    }, () => {});

    return () => {
      unsub1();
      unsub2();
    };
  } catch (err) {
    return () => {};
  }
}

export async function removeFriendInCloud(friendshipId) {
  if (!friendshipId) return;
  try {
    const friendRef = doc(firestore, 'concord_friends', String(friendshipId));
    await deleteDoc(friendRef);
  } catch (err) {}
}

// WebRTC Real-Time Voice Signaling via Cloud
export async function sendVoiceSignalInCloud(channelId, senderId, targetId, type, data) {
  if (!channelId || !senderId || !targetId || !type || !data) return;
  try {
    const signalId = `vsig_${channelId}_${senderId}_${targetId}_${type}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const signalRef = doc(firestore, 'concord_voice_signals', signalId);
    await setDoc(signalRef, {
      id: signalId,
      channelId: String(channelId),
      senderId: String(senderId),
      targetId: String(targetId),
      type,
      data: JSON.stringify(data),
      timestamp: Date.now()
    });
  } catch (err) {
    console.warn('Error sending voice signal in cloud:', err);
  }
}

export function listenToVoiceSignalsInCloud(channelId, myUserId, onSignal) {
  if (!channelId || !myUserId) return () => {};
  try {
    const minTimestamp = Date.now() - 30000;
    const q = query(
      collection(firestore, 'concord_voice_signals'),
      where('channelId', '==', String(channelId)),
      where('targetId', '==', String(myUserId))
    );

    const processedSignals = new Set();

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const docData = change.doc.data();
          if (!docData || docData.timestamp < minTimestamp) return;
          if (processedSignals.has(docData.id)) return;
          processedSignals.add(docData.id);

          try {
            const parsedData = JSON.parse(docData.data);
            onSignal({
              senderId: docData.senderId,
              targetId: docData.targetId,
              type: docData.type,
              data: parsedData
            });
            deleteDoc(change.doc.ref).catch(() => {});
          } catch (e) {
            console.warn('Failed to parse voice signal data:', e);
          }
        }
      });
    }, (error) => {
      console.warn('Error listening to voice signals:', error);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('Failed to setup voice signal listener:', err);
    return () => {};
  }
}

/**
 * =========================================================================
 * APP VERSION & AUTO-UPDATE SYSTEM
 * =========================================================================
 */

export async function getLatestAppVersionFromCloud() {
  try {
    const docRef = doc(firestore, 'concord_app_version', 'latest');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {}
  return null;
}

export async function publishAppVersionToCloud(versionInfo) {
  if (!versionInfo || !versionInfo.version) return;
  try {
    const docRef = doc(firestore, 'concord_app_version', 'latest');
    await setDoc(docRef, {
      ...versionInfo,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Error publishing app version to cloud:', err);
  }
}

export function listenToAppVersionInCloud(callback) {
  try {
    const docRef = doc(firestore, 'concord_app_version', 'latest');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        callback(snap.data());
      }
    }, () => {});
  } catch (err) {
    return () => {};
  }
}
