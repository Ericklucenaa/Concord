// Security rules tests. Run with: npm run test:emulators
import { readFileSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  arrayUnion,
  arrayRemove,
  deleteField
} from 'firebase/firestore';

const PROJECT_ID = 'demo-concord-rules';
let env;

const OWNER = 'owneruid';
const ADMIN = 'adminuid';
const MOD = 'moduid';
const MEMBER = 'memberuid';
const STRANGER = 'strangeruid';

const SERVER = {
  id: 'srv1',
  name: 'Teste',
  ownerId: OWNER,
  memberIds: [OWNER, ADMIN, MOD, MEMBER],
  roles: { [OWNER]: 'owner', [ADMIN]: 'admin', [MOD]: 'moderator', [MEMBER]: 'member' },
  channels: [
    { id: 'general', name: 'geral', type: 'text' },
    { id: 'staff', name: 'staff', type: 'text' },
    { id: 'news', name: 'avisos', type: 'text' }
  ],
  channelRoles: { staff: ['moderator'] },
  readOnlyChannels: { news: true },
  mutedIds: [],
  bannedIds: []
};

const db = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

function message(id, overrides = {}) {
  return {
    id,
    serverId: 'srv1',
    channelId: 'general',
    userId: MEMBER,
    username: 'member',
    content: 'oi',
    reactions: {},
    pinned: false,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085').split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host,
      port: Number(port)
    }
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (f) => {
    await setDoc(doc(f, 'concord_servers', 'srv1'), SERVER);
    await setDoc(doc(f, 'concord_invites', 'GOODCODE'), { code: 'GOODCODE', serverId: 'srv1', creatorId: OWNER });
    await setDoc(doc(f, 'concord_invites', 'OTHERSRV'), { code: 'OTHERSRV', serverId: 'srv2', creatorId: STRANGER });
    await setDoc(doc(f, 'concord_messages', 'm1'), message('m1'));
    await setDoc(doc(f, 'concord_messages', 'm-staff'), message('m-staff', { channelId: 'staff', userId: MOD }));
  });
});

describe('unauthenticated access', () => {
  it('cannot read servers, messages or users', async () => {
    await assertFails(getDoc(doc(anon(), 'concord_servers', 'srv1')));
    await assertFails(getDoc(doc(anon(), 'concord_messages', 'm1')));
    await assertFails(getDocs(collection(anon(), 'concord_users')));
  });

  it('can read the update manifest but never write it', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'concord_app_version', 'latest')));
    await assertFails(setDoc(doc(db(OWNER), 'concord_app_version', 'latest'), { downloadUrl: 'https://evil.example' }));
  });

  it('denies unknown collections', async () => {
    await assertFails(setDoc(doc(db(MEMBER), 'anything', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(db(MEMBER), 'concord_voice_rooms', 'x')));
  });
});

describe('servers', () => {
  it('members can read, strangers cannot', async () => {
    await assertSucceeds(getDoc(doc(db(MEMBER), 'concord_servers', 'srv1')));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_servers', 'srv1')));
  });

  it('lists only servers the user belongs to', async () => {
    await assertSucceeds(getDocs(query(collection(db(MEMBER), 'concord_servers'), where('memberIds', 'array-contains', MEMBER))));
    await assertFails(getDocs(collection(db(MEMBER), 'concord_servers')));
  });

  it('creating a server requires being its sole owner', async () => {
    const ok = { id: 's', name: 'x', ownerId: STRANGER, memberIds: [STRANGER], roles: { [STRANGER]: 'owner' }, channels: [] };
    await assertSucceeds(setDoc(doc(db(STRANGER), 'concord_servers', 's'), ok));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_servers', 's2'), { ...ok, memberIds: [STRANGER, MEMBER], roles: { [STRANGER]: 'owner', [MEMBER]: 'owner' } }));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_servers', 's3'), { ...ok, ownerId: OWNER }));
  });

  it('joining requires a valid invite for this server', async () => {
    const join = (code) => updateDoc(doc(db(STRANGER), 'concord_servers', 'srv1'), {
      memberIds: arrayUnion(STRANGER),
      [`roles.${STRANGER}`]: 'member',
      lastJoinCode: code
    });
    await assertFails(join('NOPE'));
    await assertFails(join('OTHERSRV'));
    await assertSucceeds(join('GOODCODE'));
  });

  it('cannot join as admin or while banned', async () => {
    await assertFails(updateDoc(doc(db(STRANGER), 'concord_servers', 'srv1'), {
      memberIds: arrayUnion(STRANGER),
      [`roles.${STRANGER}`]: 'admin',
      lastJoinCode: 'GOODCODE'
    }));
    await seed((f) => updateDoc(doc(f, 'concord_servers', 'srv1'), { bannedIds: [STRANGER] }));
    await assertFails(updateDoc(doc(db(STRANGER), 'concord_servers', 'srv1'), {
      memberIds: arrayUnion(STRANGER),
      [`roles.${STRANGER}`]: 'member',
      lastJoinCode: 'GOODCODE'
    }));
  });

  it('members can leave; the owner must transfer first', async () => {
    const leave = (uid) => updateDoc(doc(db(uid), 'concord_servers', 'srv1'), {
      memberIds: arrayRemove(uid),
      [`roles.${uid}`]: deleteField()
    });
    await assertSucceeds(leave(MEMBER));
    await assertFails(leave(OWNER));
  });

  it('members cannot rename the server or promote themselves', async () => {
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_servers', 'srv1'), { name: 'hack' }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_servers', 'srv1'), { [`roles.${MEMBER}`]: 'admin' }));
  });

  it('admins can kick but not take ownership', async () => {
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'concord_servers', 'srv1'), {
      memberIds: arrayRemove(MEMBER),
      [`roles.${MEMBER}`]: deleteField()
    }));
    await assertFails(updateDoc(doc(db(ADMIN), 'concord_servers', 'srv1'), { ownerId: ADMIN }));
    await assertFails(updateDoc(doc(db(ADMIN), 'concord_servers', 'srv1'), {
      memberIds: arrayRemove(OWNER),
      [`roles.${OWNER}`]: deleteField()
    }));
  });

  it('moderators can only change the voice-mute list', async () => {
    await assertSucceeds(updateDoc(doc(db(MOD), 'concord_servers', 'srv1'), { mutedIds: arrayUnion(MEMBER) }));
    await assertFails(updateDoc(doc(db(MOD), 'concord_servers', 'srv1'), {
      memberIds: arrayRemove(MEMBER),
      [`roles.${MEMBER}`]: deleteField()
    }));
  });

  it('owner can transfer ownership and delete the server', async () => {
    await assertSucceeds(updateDoc(doc(db(OWNER), 'concord_servers', 'srv1'), {
      ownerId: ADMIN,
      [`roles.${ADMIN}`]: 'owner',
      [`roles.${OWNER}`]: 'admin'
    }));
    await assertFails(deleteDoc(doc(db(OWNER), 'concord_servers', 'srv1')));
    await assertSucceeds(deleteDoc(doc(db(ADMIN), 'concord_servers', 'srv1')));
  });
});

describe('channel messages', () => {
  it('only members who can see the channel can read', async () => {
    await assertSucceeds(getDoc(doc(db(MEMBER), 'concord_messages', 'm1')));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_messages', 'm1')));
    await assertFails(getDoc(doc(db(MEMBER), 'concord_messages', 'm-staff')));
    await assertSucceeds(getDoc(doc(db(MOD), 'concord_messages', 'm-staff')));
    await assertSucceeds(getDoc(doc(db(ADMIN), 'concord_messages', 'm-staff')));
  });

  it('channel queries must be scoped to the server', async () => {
    const scoped = query(collection(db(MEMBER), 'concord_messages'), where('serverId', '==', 'srv1'), where('channelId', '==', 'general'));
    await assertSucceeds(getDocs(scoped));
    await assertFails(getDocs(query(collection(db(MEMBER), 'concord_messages'), where('channelId', '==', 'general'))));
  });

  it('cannot post as someone else or into read-only channels', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_messages', 'm2'), message('m2')));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_messages', 'm3'), message('m3', { userId: OWNER })));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_messages', 'm4'), message('m4', { channelId: 'news' })));
    await assertSucceeds(setDoc(doc(db(MOD), 'concord_messages', 'm5'), message('m5', { channelId: 'news', userId: MOD })));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_messages', 'm6'), message('m6', { userId: STRANGER })));
  });

  it('only the author edits; members react; moderators pin', async () => {
    await assertSucceeds(updateDoc(doc(db(MEMBER), 'concord_messages', 'm1'), { content: 'editado', editedAt: 'now' }));
    await assertFails(updateDoc(doc(db(ADMIN), 'concord_messages', 'm1'), { content: 'hack' }));
    await assertSucceeds(updateDoc(doc(db(ADMIN), 'concord_messages', 'm1'), { 'reactions.👍': arrayUnion(ADMIN) }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_messages', 'm1'), { pinned: true }));
    await assertSucceeds(updateDoc(doc(db(MOD), 'concord_messages', 'm1'), { pinned: true, pinnedBy: MOD }));
  });

  it('author or moderators delete', async () => {
    await seed((f) => setDoc(doc(f, 'concord_messages', 'm-owner'), message('m-owner', { userId: OWNER })));
    await assertFails(deleteDoc(doc(db(MEMBER), 'concord_messages', 'm-owner')));
    await assertSucceeds(deleteDoc(doc(db(MEMBER), 'concord_messages', 'm1')));
    await assertSucceeds(deleteDoc(doc(db(MOD), 'concord_messages', 'm-owner')));
  });
});

describe('direct messages', () => {
  const pair = [MEMBER, OWNER].sort();
  const THREAD = `dm_${pair[0]}_${pair[1]}`;

  beforeEach(async () => {
    await seed(async (f) => {
      await setDoc(doc(f, 'concord_dm_threads', THREAD), { id: THREAD, isGroup: false, participants: pair });
      await setDoc(doc(f, 'concord_direct_messages', 'd1'), { id: 'd1', dmId: THREAD, senderId: MEMBER, content: 'oi', createdAt: 'x' });
    });
  });

  it('only participants read', async () => {
    await assertSucceeds(getDoc(doc(db(OWNER), 'concord_direct_messages', 'd1')));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_direct_messages', 'd1')));
    await assertFails(getDocs(query(collection(db(STRANGER), 'concord_dm_threads'), where('participants', 'array-contains', MEMBER))));
  });

  it('thread ids must match their participants', async () => {
    const p = [STRANGER, ADMIN].sort();
    await assertSucceeds(setDoc(doc(db(STRANGER), 'concord_dm_threads', `dm_${p[0]}_${p[1]}`), { isGroup: false, participants: p }));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_dm_threads', 'dm_fake'), { isGroup: false, participants: p }));
  });

  it('blocked users cannot send', async () => {
    const send = (id) => setDoc(doc(db(MEMBER), 'concord_direct_messages', id), { id, dmId: THREAD, senderId: MEMBER, content: 'oi' });
    await assertSucceeds(send('d2'));
    await seed((f) => setDoc(doc(f, 'concord_blocks', OWNER), { blockedIds: [MEMBER] }));
    await assertFails(send('d3'));
  });

  it('cannot send as someone else', async () => {
    await assertFails(setDoc(doc(db(MEMBER), 'concord_direct_messages', 'd4'), { id: 'd4', dmId: THREAD, senderId: OWNER, content: 'x' }));
  });
});

describe('friends, nicknames and blocks', () => {
  const pair = [MEMBER, STRANGER].sort();
  const pairId = pair.join('_');

  it('requester cannot accept their own request', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_friends', pairId), { participants: pair, requesterId: MEMBER, status: 'pending' }));
    await assertFails(updateDoc(doc(db(MEMBER), 'concord_friends', pairId), { status: 'accepted' }));
    await assertSucceeds(updateDoc(doc(db(STRANGER), 'concord_friends', pairId), { status: 'accepted' }));
  });

  it('cannot create an already accepted friendship', async () => {
    await assertFails(setDoc(doc(db(MEMBER), 'concord_friends', pairId), { participants: pair, requesterId: MEMBER, status: 'accepted' }));
  });

  it('nicknames cannot be taken over', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_nicknames', 'joao'), { userId: MEMBER, username: 'joao' }));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_nicknames', 'joao'), { userId: STRANGER, username: 'joao' }));
    await assertFails(deleteDoc(doc(db(STRANGER), 'concord_nicknames', 'joao')));
    await assertSucceeds(getDoc(doc(anon(), 'concord_nicknames', 'joao')));
    await assertFails(getDocs(collection(anon(), 'concord_nicknames')));
  });

  it('block lists and read states are private', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_blocks', MEMBER), { blockedIds: [STRANGER] }));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_blocks', MEMBER)));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_read_states', MEMBER), { channels: {} }));
  });

  it('users only write their own profile', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_users', MEMBER), { id: MEMBER, username: 'm' }));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_users', OWNER), { id: OWNER, username: 'hack' }));
  });
});

describe('voice presence and signaling', () => {
  it('users write only their own presence; moderators can disconnect others', async () => {
    const presence = (uid) => ({ userId: uid, serverId: 'srv1', channelId: 'v1', lastSeen: 1 });
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_voice_presence', MEMBER), presence(MEMBER)));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_voice_presence', ADMIN), presence(ADMIN)));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_voice_presence', STRANGER), presence(STRANGER)));
    await assertFails(deleteDoc(doc(db(STRANGER), 'concord_voice_presence', MEMBER)));
    await seed((f) => setDoc(doc(f, 'concord_voice_presence', OWNER), presence(OWNER)));
    await assertFails(deleteDoc(doc(db(MEMBER), 'concord_voice_presence', OWNER)));
    await assertSucceeds(deleteDoc(doc(db(MOD), 'concord_voice_presence', MEMBER)));
  });

  it('signals are readable only by their target', async () => {
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_voice_signals', 's1'), { senderId: MEMBER, targetId: OWNER, channelId: 'v1' }));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_voice_signals', 's2'), { senderId: OWNER, targetId: MEMBER, channelId: 'v1' }));
    await assertSucceeds(getDoc(doc(db(OWNER), 'concord_voice_signals', 's1')));
    await assertFails(getDoc(doc(db(ADMIN), 'concord_voice_signals', 's1')));
  });
});

describe('attachments and audit log', () => {
  it('attachments follow scope membership', async () => {
    const meta = { id: 'a1', ownerId: MEMBER, scopeType: 'server', scopeId: 'srv1', name: 'f.txt', size: 10, chunkCount: 1 };
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_attachments', 'a1'), meta));
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_attachments', 'a1', 'chunks', '000'), { index: 0, data: 'aGk=' }));
    await assertSucceeds(getDoc(doc(db(OWNER), 'concord_attachments', 'a1', 'chunks', '000')));
    await assertFails(getDoc(doc(db(STRANGER), 'concord_attachments', 'a1')));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_attachments', 'a2'), { ...meta, id: 'a2', size: 20 * 1024 * 1024 }));
    await assertFails(setDoc(doc(db(STRANGER), 'concord_attachments', 'a3'), { ...meta, id: 'a3', ownerId: STRANGER }));
  });

  it('audit log is written and read by moderators only', async () => {
    const entry = (uid) => ({ serverId: 'srv1', actorId: uid, action: 'kick', createdAt: 'x' });
    await assertSucceeds(setDoc(doc(db(MOD), 'concord_audit', 'e1'), entry(MOD)));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_audit', 'e2'), entry(MEMBER)));
    await assertFails(getDoc(doc(db(MEMBER), 'concord_audit', 'e1')));
    await assertSucceeds(getDoc(doc(db(ADMIN), 'concord_audit', 'e1')));
    await assertFails(updateDoc(doc(db(ADMIN), 'concord_audit', 'e1'), { action: 'x' }));
  });

  it('mentions can only target members and are read by the target', async () => {
    const m = (target) => ({ targetId: target, authorId: MEMBER, serverId: 'srv1', channelId: 'general', messageId: 'm1' });
    await assertSucceeds(setDoc(doc(db(MEMBER), 'concord_mentions', 'x1'), m(OWNER)));
    await assertFails(setDoc(doc(db(MEMBER), 'concord_mentions', 'x2'), m(STRANGER)));
    await assertSucceeds(getDoc(doc(db(OWNER), 'concord_mentions', 'x1')));
    await assertFails(getDoc(doc(db(ADMIN), 'concord_mentions', 'x1')));
  });
});
