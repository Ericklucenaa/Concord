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

export async function findUserByNicknameInCloud(nickname) {
  if (!nickname) return null;
  const cleanNick = nickname.trim().replace(/^@/, '').toLowerCase();
  try {
    const nickDocRef = doc(firestore, 'concord_nicknames', cleanNick);
    const snap = await getDoc(nickDocRef);
    if (snap.exists()) {
      return snap.data();
    }

    // Fallback search in users collection
    const q = query(
      collection(firestore, 'concord_users'),
      where('username', '==', nickname.trim().replace(/^@/, ''))
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data();
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
    const cleanCode = invite.code.toUpperCase();
    const inviteRef = doc(firestore, 'concord_invites', cleanCode);
    await setDoc(inviteRef, {
      ...invite,
      code: cleanCode,
      createdAt: new Date().toISOString()
    }, { merge: true });

    // If targeted to a specific username
    if (invite.receiverUsername) {
      const cleanReceiver = invite.receiverUsername.trim().toLowerCase().replace(/^@/, '');
      const userInviteRef = doc(firestore, 'concord_user_invites', `${cleanReceiver}_${invite.id || cleanCode}`);
      await setDoc(userInviteRef, {
        ...invite,
        code: cleanCode,
        receiverUsername: cleanReceiver,
        status: 'pending',
        createdAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (err) {}
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
      list.push(docSnap.data());
    });
  } catch (err) {}
  return list;
}

export async function respondInviteInCloud(inviteId, action, currentUser) {
  if (!inviteId) return;
  try {
    const cleanReceiver = (currentUser?.username || '').trim().toLowerCase().replace(/^@/, '');
    const userInviteRef = doc(firestore, 'concord_user_invites', `${cleanReceiver}_${inviteId}`);
    
    if (action === 'accept') {
      await setDoc(userInviteRef, { status: 'accepted' }, { merge: true });
    } else {
      await deleteDoc(userInviteRef);
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
