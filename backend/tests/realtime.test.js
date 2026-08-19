import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { io as ioClient } from 'socket.io-client';
import app from '../src/app.js';
import { initDb, db } from '../src/db/database.js';
import { setupSocketIO } from '../src/socket/socketHandler.js';

let server;
let baseUrl;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = './database/test_concord_realtime.sqlite';
  await initDb();

  await db.exec(`
    DELETE FROM channel_permissions;
    DELETE FROM messages;
    DELETE FROM invites;
    DELETE FROM server_members;
    DELETE FROM channels;
    DELETE FROM servers;
    DELETE FROM users;
  `);

  server = http.createServer(app);
  setupSocketIO(server, '*');

  await new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

function waitForEvent(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Concord Realtime (Socket.IO) Integration', () => {
  let aliceToken, aliceId, aliceSocket;
  let bobToken, bobId, bobSocket;
  let serverId, textChannelId;

  test('Setup: register Alice & Bob, connect their sockets', async () => {
    const aliceRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice_rt', email: 'alice_rt@test.com', password: 'password123' })
    });
    const aliceData = await aliceRes.json();
    aliceToken = aliceData.token;
    aliceId = aliceData.user.id;

    const bobRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'bob_rt', email: 'bob_rt@test.com', password: 'password123' })
    });
    const bobData = await bobRes.json();
    bobToken = bobData.token;
    bobId = bobData.user.id;

    aliceSocket = ioClient(baseUrl, { auth: { token: aliceToken }, transports: ['websocket'] });
    bobSocket = ioClient(baseUrl, { auth: { token: bobToken }, transports: ['websocket'] });

    await Promise.all([
      waitForEvent(aliceSocket, 'connect'),
      waitForEvent(bobSocket, 'connect')
    ]);

    assert.ok(aliceSocket.connected);
    assert.ok(bobSocket.connected);
  });

  test('Alice creates a server via REST', async () => {
    const res = await fetch(`${baseUrl}/api/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ name: 'Realtime Test Server' })
    });
    const data = await res.json();
    assert.equal(res.status, 201);
    serverId = data.server.id;
    textChannelId = data.server.channels.find((c) => c.type === 'text').id;
  });

  test('Bob receives INVITE_RECEIVED live over his socket the moment Alice invites him', async () => {
    const invitePromise = waitForEvent(bobSocket, 'invite:received');

    const res = await fetch(`${baseUrl}/api/invites/server/${serverId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aliceToken}` },
      body: JSON.stringify({ username: 'bob_rt' })
    });
    assert.equal(res.status, 201);

    const invitePayload = await invitePromise;
    assert.equal(invitePayload.serverId, serverId);
    assert.equal(invitePayload.receiverUsername, 'bob_rt');
  });

  test('Alice sees MEMBER_JOINED live the instant Bob joins via invite code', async () => {
    const invites = await fetch(`${baseUrl}/api/invites/pending`, {
      headers: { Authorization: `Bearer ${bobToken}` }
    }).then((r) => r.json());
    const code = invites.invites[0].code;

    const memberJoinedPromise = waitForEvent(aliceSocket, 'member:joined');

    const joinRes = await fetch(`${baseUrl}/api/invites/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bobToken}` },
      body: JSON.stringify({ code })
    });
    assert.equal(joinRes.status, 200);

    const payload = await memberJoinedPromise;
    assert.equal(payload.serverId, serverId);
    assert.equal(payload.member.username, 'bob_rt');
  });

  test('Bob (now auto-joined to the server room) sees a chat message from Alice live', async () => {
    // Bob's socket should have been force-joined into `server:${serverId}` by the
    // backend right after accepting the invite. Now both join the channel room.
    aliceSocket.emit('channel:join', { channelId: textChannelId });
    bobSocket.emit('channel:join', { channelId: textChannelId });
    await new Promise((r) => setTimeout(r, 150));

    const messagePromise = waitForEvent(bobSocket, 'message:new');
    aliceSocket.emit('message:send', { channelId: textChannelId, content: 'Fala Bob, tudo certo?' });

    const msg = await messagePromise;
    assert.equal(msg.content, 'Fala Bob, tudo certo?');
    assert.equal(msg.channelId, textChannelId);
  });

  test('Bob sees the message get removed live when Alice deletes it', async () => {
    const messages = await fetch(`${baseUrl}/api/messages/channel/${textChannelId}`, {
      headers: { Authorization: `Bearer ${aliceToken}` }
    }).then((r) => r.json());
    const messageId = messages.messages[messages.messages.length - 1].id;

    const deletePromise = waitForEvent(bobSocket, 'message:delete');
    const delRes = await fetch(`${baseUrl}/api/messages/${messageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert.equal(delRes.status, 200);

    const payload = await deletePromise;
    assert.equal(payload.messageId, messageId);
  });

  test('Bob is notified live and dropped from the server when kicked', async () => {
    const kickedPromise = waitForEvent(bobSocket, 'member:kicked');

    const res = await fetch(`${baseUrl}/api/members/server/${serverId}/member/${bobId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceToken}` }
    });
    assert.equal(res.status, 200);

    const payload = await kickedPromise;
    assert.equal(payload.serverId, serverId);
  });

  test('Cleanup: disconnect sockets', async () => {
    aliceSocket.disconnect();
    bobSocket.disconnect();
    assert.ok(true);
  });
});
