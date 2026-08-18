import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import app from '../src/app.js';
import { initDb, db } from '../src/db/database.js';

let server;
let baseUrl;

before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = './database/test_concord.sqlite';
  await initDb();

  // Clear existing test data
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

describe('Concord Backend Comprehensive Tests', () => {
  let user1Token;
  let user1Id;
  let user2Token;
  let user2Id;
  let testServerId;
  let testTextChannelId;
  let testVoiceChannelId;
  let inviteCode;

  test('1. Health Check Endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.status, 'ok');
  });

  test('2. Register User 1 (Alice)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'AliceMaster',
        email: 'alice@example.com',
        password: 'password123'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.ok(data.token);
    assert.equal(data.user.username, 'AliceMaster');
    user1Token = data.token;
    user1Id = data.user.id;
  });

  test('3. Rejects duplicate username/email', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'AliceMaster',
        email: 'alice_different@example.com',
        password: 'password123'
      })
    });

    assert.equal(res.status, 409);
  });

  test('4. Register User 2 (Bob)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'BobGamer',
        email: 'bob@example.com',
        password: 'password123'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    user2Token = data.token;
    user2Id = data.user.id;
  });

  test('5. Login with invalid password fails', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: 'AliceMaster',
        password: 'wrongpassword'
      })
    });

    assert.equal(res.status, 401);
  });

  test('6. Login with correct username succeeds', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: 'AliceMaster',
        password: 'password123'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.token);
  });

  test('7. Create Server by Alice', async () => {
    const res = await fetch(`${baseUrl}/api/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      body: JSON.stringify({
        name: 'Comunidade Alpha',
        description: 'Servidor oficial de testes'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.server.name, 'Comunidade Alpha');
    assert.equal(data.server.channels.length, 2); // geral + Sala Geral
    testServerId = data.server.id;
    testTextChannelId = data.server.channels.find(c => c.type === 'text').id;
    testVoiceChannelId = data.server.channels.find(c => c.type === 'voice').id;
  });

  test('8. Create an additional channel in server', async () => {
    const res = await fetch(`${baseUrl}/api/channels/server/${testServerId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      body: JSON.stringify({
        name: 'jogos-e-clipes',
        type: 'text'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.equal(data.channel.name, 'jogos-e-clipes');
  });

  test('9. Send Invite to Bob via username', async () => {
    const res = await fetch(`${baseUrl}/api/invites/server/${testServerId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      body: JSON.stringify({
        username: '@BobGamer'
      })
    });

    const data = await res.json();
    assert.equal(res.status, 201);
    assert.ok(data.invite.code);
    inviteCode = data.invite.code;
  });

  test('10. Bob checks pending invites and accepts', async () => {
    // 1. Get pending invites
    const listRes = await fetch(`${baseUrl}/api/invites/pending`, {
      headers: { 'Authorization': `Bearer ${user2Token}` }
    });
    const listData = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.ok(listData.invites.length > 0);
    const inviteId = listData.invites[0].id;

    // 2. Accept invite
    const acceptRes = await fetch(`${baseUrl}/api/invites/${inviteId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user2Token}`
      },
      body: JSON.stringify({ action: 'accept' })
    });
    const acceptData = await acceptRes.json();
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptData.serverId, testServerId);
  });

  test('11. Bob verifies he is now a member of Comunidade Alpha', async () => {
    const res = await fetch(`${baseUrl}/api/servers/${testServerId}`, {
      headers: { 'Authorization': `Bearer ${user2Token}` }
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.server.name, 'Comunidade Alpha');
    const memberBob = data.server.members.find(m => m.username === 'BobGamer');
    assert.ok(memberBob);
    assert.equal(memberBob.role, 'member');
  });

  test('12. Member permissions: Bob cannot delete the server or kick Alice', async () => {
    // Bob tries to delete server
    const deleteRes = await fetch(`${baseUrl}/api/servers/${testServerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${user2Token}` }
    });
    assert.equal(deleteRes.status, 403);

    // Bob tries to kick Alice
    const kickRes = await fetch(`${baseUrl}/api/members/server/${testServerId}/member/${user1Id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${user2Token}` }
    });
    assert.equal(kickRes.status, 403);
  });

  test('13. Alice (Owner) can mute Bob and update Bob role to moderator', async () => {
    // Alice mutes Bob
    const muteRes = await fetch(`${baseUrl}/api/members/server/${testServerId}/member/${user2Id}/mute`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      body: JSON.stringify({ muted: true })
    });
    const muteData = await muteRes.json();
    assert.equal(muteRes.status, 200);
    assert.equal(muteData.mutedByAdmin, true);

    // Alice promotes Bob to moderator
    const roleRes = await fetch(`${baseUrl}/api/members/server/${testServerId}/member/${user2Id}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      body: JSON.stringify({ role: 'moderator' })
    });
    const roleData = await roleRes.json();
    assert.equal(roleRes.status, 200);
    assert.equal(roleData.role, 'moderator');
  });

  test('14. WebRTC ICE Config endpoint returns STUN servers', async () => {
    const res = await fetch(`${baseUrl}/api/config/webrtc`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(data.iceServers));
    assert.ok(data.iceServers.length > 0);
  });
});
