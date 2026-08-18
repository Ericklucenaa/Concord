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
  deleteDoc 
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
  } catch (err) {
    console.warn('Cloud user sync notice:', err);
  }
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
  } catch (err) {
    console.warn('Cloud nickname lookup notice:', err);
  }
  return null;
}

export async function saveServerToCloud(server) {
  if (!server || !server.id) return;
  try {
    const serverRef = doc(firestore, 'concord_servers', String(server.id));
    await setDoc(serverRef, {
      id: String(server.id),
      name: server.name || 'Servidor Concord',
      description: server.description || '',
      icon: server.icon || '',
      ownerId: server.ownerId || '',
      channels: server.channels || [],
      members: server.members || [],
      inviteCodes: server.inviteCodes || [],
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Cloud save server notice:', err);
  }
}

export async function getServerFromCloud(serverId) {
  if (!serverId) return null;
  try {
    const serverRef = doc(firestore, 'concord_servers', String(serverId));
    const snap = await getDoc(serverRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {
    console.warn('Cloud get server notice:', err);
  }
  return null;
}

export async function getUserServersFromCloud(userId, username) {
  const result = [];
  try {
    const q = collection(firestore, 'concord_servers');
    const snapshot = await getDocs(q);
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const isMember = (data.members || []).some(
        (m) => String(m.id) === String(userId) || (username && m.username?.toLowerCase() === username.toLowerCase())
      );
      const isOwner = String(data.ownerId) === String(userId);
      if (isMember || isOwner) {
        result.push(data);
      }
    });
  } catch (err) {
    console.warn('Cloud get user servers notice:', err);
  }
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
  } catch (err) {
    console.warn('Cloud save invite notice:', err);
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
  } catch (err) {
    console.warn('Cloud get invite notice:', err);
  }
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
    console.warn('Cloud join server notice:', err);
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
  } catch (err) {
    console.warn('Cloud get pending invites notice:', err);
  }
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
  } catch (err) {
    console.warn('Cloud respond invite notice:', err);
  }
}
