import {
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { firestore } from '../firebase';
import { logWarn, quietly } from '../log';
import { leaveServer } from './servers';
import { leaveGroup } from './dms';
import { leaveVoicePresence } from './voice';

// "Baixar meus dados" and "Excluir minha conta" (LGPD).

async function docsOf(q) {
  try {
    return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    logWarn('export query', err);
    return [];
  }
}

async function single(path, id) {
  try {
    const snap = await getDoc(doc(firestore, path, id));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

/** Collects everything the account can read about itself into one object. */
export async function exportMyData(userId, servers, threads) {
  const data = {
    exportedAt: new Date().toISOString(),
    profile: await single('concord_users', userId),
    settings: await single('concord_user_settings', userId),
    blocks: await single('concord_blocks', userId),
    readStates: await single('concord_read_states', userId),
    friendships: await docsOf(query(collection(firestore, 'concord_friends'), where('participants', 'array-contains', userId))),
    servers: servers.map((s) => ({ id: s.id, name: s.name, role: s.role, joined: true })),
    channelMessages: [],
    directMessages: []
  };

  for (const server of servers) {
    for (const channel of server.channels.filter((c) => c.type === 'text')) {
      const msgs = await docsOf(query(
        collection(firestore, 'concord_messages'),
        where('serverId', '==', server.id),
        where('channelId', '==', channel.id),
        orderBy('createdAt', 'desc'),
        limit(1000)
      ));
      msgs.filter((m) => m.userId === userId).forEach((m) => data.channelMessages.push({
        server: server.name, channel: channel.name, content: m.content, createdAt: m.createdAt, editedAt: m.editedAt || null
      }));
    }
  }

  for (const thread of threads) {
    const msgs = await docsOf(query(
      collection(firestore, 'concord_direct_messages'),
      where('dmId', '==', thread.id),
      orderBy('createdAt', 'desc'),
      limit(2000)
    ));
    msgs.forEach((m) => data.directMessages.push({
      thread: thread.id, fromMe: m.senderId === userId, author: m.senderUsername, content: m.content, createdAt: m.createdAt
    }));
  }
  return data;
}

/**
 * Removes the account's data: leaves (or hands over) every server and group,
 * deletes its own DM messages, friendships, nickname and profile. Messages
 * the user posted in servers are deleted too.
 */
export async function deleteMyData(user, servers, threads, onProgress) {
  const step = (label) => onProgress?.(label);
  const uid = user.id;

  step('Saindo das chamadas…');
  await quietly('leave voice', leaveVoicePresence(uid));

  step('Removendo suas mensagens dos servidores…');
  for (const server of servers) {
    for (const channel of server.channels.filter((c) => c.type === 'text')) {
      const msgs = await docsOf(query(
        collection(firestore, 'concord_messages'),
        where('serverId', '==', server.id),
        where('channelId', '==', channel.id),
        orderBy('createdAt', 'desc'),
        limit(2000)
      ));
      for (const m of msgs.filter((x) => x.userId === uid)) {
        await quietly('delete message', deleteDoc(doc(firestore, 'concord_messages', m.id)));
      }
    }
  }

  step('Removendo suas mensagens diretas…');
  for (const thread of threads) {
    const msgs = await docsOf(query(collection(firestore, 'concord_direct_messages'), where('dmId', '==', thread.id), limit(2000)));
    for (const m of msgs.filter((x) => x.senderId === uid)) {
      await quietly('delete dm', deleteDoc(doc(firestore, 'concord_direct_messages', m.id)));
    }
    if (thread.isGroup) await quietly('leave group', leaveGroup(thread, uid));
  }

  step('Saindo dos servidores…');
  for (const server of servers) {
    await quietly('leave server', leaveServer(server, uid));
  }

  step('Removendo amizades e configurações…');
  const friendships = await docsOf(query(collection(firestore, 'concord_friends'), where('participants', 'array-contains', uid)));
  for (const f of friendships) await quietly('delete friendship', deleteDoc(doc(firestore, 'concord_friends', f.id)));
  const mentions = await docsOf(query(collection(firestore, 'concord_mentions'), where('targetId', '==', uid), limit(500)));
  for (const m of mentions) await quietly('delete mention', deleteDoc(doc(firestore, 'concord_mentions', m.id)));
  for (const path of ['concord_blocks', 'concord_read_states', 'concord_user_settings']) {
    await quietly('delete settings', deleteDoc(doc(firestore, path, uid)));
  }
  if (user.username) {
    await quietly('release nickname', deleteDoc(doc(firestore, 'concord_nicknames', user.username.toLowerCase())));
  }
  await quietly('delete profile', deleteDoc(doc(firestore, 'concord_users', uid)));
}
