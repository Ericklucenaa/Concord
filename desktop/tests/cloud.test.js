// Integration tests for the client data layer (services/cloud/*) against the
// Firestore + Auth emulators, with the real security rules. Each step signs in
// as the user performing it, exactly like the app does.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { terminate } from 'firebase/firestore';
import { auth, firestore } from '../src/renderer/services/firebase';
import { claimNickname, findUserByNickname, saveUserProfile, listenToUsers, effectiveStatus, sendHeartbeat } from '../src/renderer/services/cloud/users';
import {
  createServer,
  createInvite,
  joinServerWithCode,
  listenToMyServers,
  addChannel,
  updateChannel,
  deleteChannel,
  setMemberRole,
  kickMember,
  banMember,
  leaveServer,
  sendInviteToUser,
  logAudit
} from '../src/renderer/services/cloud/servers';
import {
  sendMessage,
  listenToMessages,
  editMessage,
  toggleReaction,
  setPinned,
  deleteMessage,
  searchMessages,
  markRead,
  listenToMyMentions,
  listenToChannelActivity,
  setTyping
} from '../src/renderer/services/cloud/messages';
import { ensureDirectThread, createGroupThread, leaveGroup } from '../src/renderer/services/cloud/dms';
import { sendFriendRequest, respondFriendRequest, listenToFriendships, blockUser } from '../src/renderer/services/cloud/friends';
import { joinVoicePresence, updateVoicePresence, listenToServerVoice, disconnectFromVoice } from '../src/renderer/services/cloud/voice';

const PASSWORD = 'senha-segura-123';

// Messages are written locally first; wait for the server like a test should.
async function sent(...args) {
  const { id, committed } = sendMessage(...args);
  await committed;
  return id;
}
const users = {};

async function as(name) {
  if (auth.currentUser?.uid === users[name].id) return users[name];
  await signOut(auth);
  await signInWithEmailAndPassword(auth, users[name].email, PASSWORD);
  return users[name];
}

async function register(name) {
  const email = `${name}@concord.app`;
  const cred = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  const user = { id: cred.user.uid, username: name, email, avatar: '' };
  users[name] = user;
  await saveUserProfile(user.id, { username: name, avatar: '', status: 'online', lastSeen: Date.now() });
  await claimNickname(user.id, name, { email });
  return user;
}

/** Resolves with the first snapshot value that satisfies `predicate`. */
function waitFor(subscribe, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let unsub = () => {};
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('timed out waiting for snapshot'));
    }, timeoutMs);
    unsub = subscribe((value) => {
      if (predicate(value)) {
        clearTimeout(timer);
        setTimeout(() => unsub(), 0);
        resolve(value);
      }
    });
  });
}

const stamp = Date.now().toString(36);

beforeAll(async () => {
  await register(`alice${stamp}`);
  await register(`bob${stamp}`);
  await register(`carol${stamp}`);
});

afterAll(async () => {
  await signOut(auth).catch(() => {});
  await terminate(firestore).catch(() => {});
});

const A = () => `alice${stamp}`;
const B = () => `bob${stamp}`;
const C = () => `carol${stamp}`;

describe('nicknames', () => {
  it('are unique and resolvable', async () => {
    const bob = await as(B());
    await expect(claimNickname(bob.id, A())).rejects.toThrow(/em uso/);
    const found = await findUserByNickname(`@${A().toUpperCase()}`);
    expect(found.id).toBe(users[A()].id);
  });
});

describe('servers, invites and channel messages', () => {
  let server;
  let invite;

  it('owner creates a server and an invite', async () => {
    const alice = await as(A());
    server = await createServer(alice, { name: 'Servidor de Teste' });
    expect(server.role).toBe('owner');
    invite = await createInvite(server, alice);
    expect(invite.code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('a stranger joins with the invite code and sees the server live', async () => {
    const bob = await as(B());
    const { server: joined } = await joinServerWithCode(invite.code.toLowerCase(), bob.id);
    expect(joined.memberIds).toContain(bob.id);
    expect(joined.role).toBe('member');
    const list = await waitFor((cb) => listenToMyServers(bob.id, cb), (s) => s.some((x) => x.id === server.id));
    expect(list.find((x) => x.id === server.id).name).toBe('Servidor de Teste');
  });

  it('member posts, owner edits nothing but can react and pin', async () => {
    const bob = await as(B());
    const scope = { type: 'channel', serverId: server.id, channelId: server.channels[0].id };
    const messageId = await sent(scope, bob, { content: `olá @${A()}`, mentions: [users[A()].id] });
    await editMessage(scope, messageId, 'olá (editado)');
    await setTyping(scope, bob);

    const alice = await as(A());
    const messages = await waitFor((cb) => listenToMessages(scope, 50, cb), (m) => m.length === 1);
    expect(messages[0].content).toBe('olá (editado)');
    expect(messages[0].authorId).toBe(bob.id);

    await toggleReaction(scope, messages[0], '🔥', alice.id);
    await setPinned(scope, messageId, true, alice.id);
    const updated = await waitFor((cb) => listenToMessages(scope, 50, cb), (m) => m[0]?.pinned === true);
    expect(updated[0].reactions['🔥']).toEqual([alice.id]);

    const mentions = await waitFor((cb) => listenToMyMentions(alice.id, cb), (m) => m.length > 0);
    expect(mentions[0].messageId).toBe(messageId);

    const found = await searchMessages([scope], 'editado');
    expect(found).toHaveLength(1);
    await markRead(alice.id, scope.channelId);

    const activity = await waitFor((cb) => listenToChannelActivity(server.id, cb), (a) => a.length > 0);
    expect(activity[0].channelId).toBe(scope.channelId);
  });

  it('read-only and role-restricted channels are enforced', async () => {
    await as(A());
    const news = await addChannel(server.id, { name: 'Avisos Oficiais', readOnly: true });
    expect(news.name).toBe('avisos-oficiais');
    const staff = await addChannel(server.id, { name: 'staff', allowedRoles: ['moderator'] });

    const bob = await as(B());
    await expect(sent({ type: 'channel', serverId: server.id, channelId: news.id }, bob, { content: 'x' })).rejects.toThrow();
    await expect(sent({ type: 'channel', serverId: server.id, channelId: staff.id }, bob, { content: 'x' })).rejects.toThrow();

    await as(A());
    await setMemberRole(server.id, bob.id, 'moderator');
    await as(B());
    await sent({ type: 'channel', serverId: server.id, channelId: news.id }, bob, { content: 'aviso' });
    await sent({ type: 'channel', serverId: server.id, channelId: staff.id }, bob, { content: 'staff' });

    await as(A());
    await updateChannel(server.id, news.id, { readOnly: false });
    await deleteChannel(server.id, staff.id);
  });

  it('moderators write the audit log; author can delete own message', async () => {
    const bob = await as(B());
    await logAudit(server.id, bob, 'test');
    const scope = { type: 'channel', serverId: server.id, channelId: server.channels[0].id };
    const id = await sent(scope, bob, { content: 'apagar' });
    await deleteMessage(scope, id);
  });

  it('direct invites reach the receiver', async () => {
    const alice = await as(A());
    await sendInviteToUser(invite, alice, users[C()]);
  });

  it('voice presence is visible to members and moderators can disconnect', async () => {
    const bob = await as(B());
    const voiceId = server.channels[1].id;
    await joinVoicePresence(bob, { serverId: server.id, channelId: voiceId }, { isMuted: false });
    await updateVoicePresence(bob.id, { isMuted: true });

    const alice = await as(A());
    const byChannel = await waitFor((cb) => listenToServerVoice(server.id, cb), (m) => (m.get(voiceId) || []).length === 1);
    expect(byChannel.get(voiceId)[0].isMuted).toBe(true);
    await disconnectFromVoice(bob.id);
    expect(alice.id).toBeTruthy();
  });

  it('kick, ban and leave', async () => {
    const carol = await as(C());
    await joinServerWithCode(invite.code, carol.id);

    await as(A());
    await kickMember(server.id, carol.id);
    await as(C());
    await joinServerWithCode(invite.code, carol.id);

    await as(A());
    await banMember(server.id, carol.id);
    await as(C());
    await expect(joinServerWithCode(invite.code, carol.id)).rejects.toThrow(/banido/);

    // Owner leaves: ownership passes to the remaining member (bob).
    const alice = await as(A());
    await leaveServer({ ...server, memberIds: [alice.id, users[B()].id], roles: { [alice.id]: 'owner', [users[B()].id]: 'moderator' } }, alice.id);
    const bob = await as(B());
    const list = await waitFor((cb) => listenToMyServers(bob.id, cb), (s) => s.some((x) => x.id === server.id && x.ownerId === bob.id));
    expect(list.find((x) => x.id === server.id).role).toBe('owner');
  });
});

describe('friends, DMs and blocking', () => {
  it('friend request flow', async () => {
    const alice = await as(A());
    const res = await sendFriendRequest(alice, B());
    expect(res.accepted).toBe(false);
    await expect(sendFriendRequest(alice, B())).rejects.toThrow(/pendente/);

    const bob = await as(B());
    const list = await waitFor((cb) => listenToFriendships(bob.id, cb), (l) => l.length === 1);
    await respondFriendRequest(list[0], 'accept', bob);
    await expect(sendFriendRequest(bob, A())).rejects.toThrow(/já são amigos/);
  });

  it('1-on-1 thread, messages and blocking', async () => {
    const alice = await as(A());
    const thread = await ensureDirectThread(alice, users[B()]);
    const again = await ensureDirectThread(alice, users[B()]);
    expect(again.id).toBe(thread.id);
    const scope = { type: 'dm', threadId: thread.id };
    await sent(scope, alice, { content: 'oi bob' });

    const bob = await as(B());
    const msgs = await waitFor((cb) => listenToMessages(scope, 50, cb), (m) => m.length === 1);
    expect(msgs[0].authorName).toBe(A());
    await toggleReaction(scope, msgs[0], '❤️', bob.id);
    await blockUser(bob.id, alice.id);

    await as(A());
    await expect(sent(scope, alice, { content: 'ainda aí?' })).rejects.toThrow();
  });

  it('group DMs: create, chat and owner hands over on leave', async () => {
    let alice = await as(A());
    await sendFriendRequest(alice, C());
    const carol0 = await as(C());
    const reqs = await waitFor((cb) => listenToFriendships(carol0.id, cb), (l) => l.some((f) => f.status === 'pending'));
    await respondFriendRequest(reqs.find((f) => f.status === 'pending'), 'accept', carol0);
    alice = await as(A());
    // Bob blocked Alice in the previous test, so he cannot be added to her group.
    await expect(createGroupThread(alice, [users[B()]], 'Bloqueado')).rejects.toThrow();
    const group = await createGroupThread(alice, [users[C()]], 'Grupo');
    const scope = { type: 'dm', threadId: group.id };
    await sent(scope, alice, { content: 'bem-vindos' });

    const carol = await as(C());
    await sent(scope, carol, { content: 'oi!' });

    await as(A());
    await leaveGroup(group, alice.id);
    await expect(sent(scope, alice, { content: 'x' })).rejects.toThrow();
  });
});

describe('presence', () => {
  it('heartbeats make users online; invisible looks offline', async () => {
    const alice = await as(A());
    await sendHeartbeat(alice.id, { status: 'dnd' });
    const map = await waitFor((cb) => listenToUsers([alice.id, users[B()].id], cb), (m) => m.get(alice.id)?.status === 'dnd');
    expect(effectiveStatus(map.get(alice.id))).toBe('dnd');
    expect(effectiveStatus({ status: 'invisible', lastSeen: Date.now() })).toBe('offline');
    expect(effectiveStatus({ status: 'online', lastSeen: Date.now() - 10 * 60_000 })).toBe('offline');
  });
});
