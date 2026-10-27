import { describe, it, expect } from 'vitest';
import { roleOf, isAdmin, isModerator, canViewChannel, canPostInChannel, outranks } from '../../src/renderer/services/permissions';
import { compareVersions } from '../../src/renderer/services/cloud/version';
import { inviteStatus } from '../../src/renderer/services/cloud/servers';
import { isMutedNow } from '../../src/renderer/services/cloud/userSettings';
import { pairIdFor, dmThreadIdFor, chunk, cleanNickname } from '../../src/renderer/services/cloud/util';
import { extractMentions, firstUrl } from '../../src/renderer/components/chat/MarkdownText';
import { drawTeams } from '../../src/renderer/components/modals/TeamDrawModal';

// Pure helpers: no emulator needed (npm run test:unit).

const server = {
  ownerId: 'o',
  memberIds: ['o', 'a', 'm', 'u'],
  roles: { a: 'admin', m: 'moderator' },
  channelRoles: { staff: ['moderator'] },
  readOnlyChannels: { news: true }
};

describe('permissions', () => {
  it('resolves roles', () => {
    expect(roleOf(server, 'o')).toBe('owner');
    expect(roleOf(server, 'a')).toBe('admin');
    expect(roleOf(server, 'u')).toBe('member');
    expect(roleOf(server, 'stranger')).toBeNull();
    expect(isAdmin(server, 'a')).toBe(true);
    expect(isAdmin(server, 'm')).toBe(false);
    expect(isModerator(server, 'm')).toBe(true);
  });

  it('restricts channels by role', () => {
    expect(canViewChannel(server, 'u', 'staff')).toBe(false);
    expect(canViewChannel(server, 'm', 'staff')).toBe(true);
    expect(canViewChannel(server, 'a', 'staff')).toBe(true);
    expect(canViewChannel(server, 'stranger', 'general')).toBe(false);
  });

  it('read-only channels accept only staff posts', () => {
    expect(canPostInChannel(server, 'u', 'news')).toBe(false);
    expect(canPostInChannel(server, 'm', 'news')).toBe(true);
    expect(canPostInChannel(server, 'u', 'general')).toBe(true);
  });

  it('only acts on lower ranks', () => {
    expect(outranks(server, 'o', 'a')).toBe(true);
    expect(outranks(server, 'a', 'm')).toBe(true);
    expect(outranks(server, 'm', 'a')).toBe(false);
    expect(outranks(server, 'a', 'a')).toBe(false);
  });
});

describe('compareVersions', () => {
  it('orders semver numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.2')).toBe(0);
    expect(compareVersions('1.1.1', '1.2.0')).toBeLessThan(0);
    expect(compareVersions(null, '0.0.1')).toBeLessThan(0);
  });
});

describe('inviteStatus', () => {
  it('detects expiry and usage limits', () => {
    expect(inviteStatus({ uses: 0 })).toBe('active');
    expect(inviteStatus({ expiresAt: Date.now() - 1 })).toBe('expired');
    expect(inviteStatus({ expiresAt: Date.now() + 60_000, maxUses: 2, uses: 1 })).toBe('active');
    expect(inviteStatus({ maxUses: 2, uses: 2 })).toBe('used_up');
  });
});

describe('isMutedNow', () => {
  it('handles timed and permanent mutes', () => {
    const now = 1_000_000;
    expect(isMutedNow({ c: 0 }, 'c', now)).toBe(true);
    expect(isMutedNow({ c: now + 1 }, 'c', now)).toBe(true);
    expect(isMutedNow({ c: now - 1 }, 'c', now)).toBe(false);
    expect(isMutedNow({}, 'c', now)).toBe(false);
    expect(isMutedNow(undefined, 'c', now)).toBe(false);
  });
});

describe('util', () => {
  it('builds order-independent pair ids', () => {
    expect(pairIdFor('b', 'a')).toBe('a_b');
    expect(dmThreadIdFor('a', 'b')).toBe(dmThreadIdFor('b', 'a'));
  });

  it('chunks arrays', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 30)).toEqual([]);
  });

  it('cleans nicknames', () => {
    expect(cleanNickname('  @erick ')).toBe('erick');
  });
});

describe('mentions & links', () => {
  const members = new Map([['erick', { id: 'u1' }], ['ana.b', { id: 'u2' }]]);

  it('extracts known members and @everyone', () => {
    expect(extractMentions('oi @Erick e @ana.b', members)).toEqual({ ids: ['u1', 'u2'], everyone: false });
    expect(extractMentions('@everyone bora', members).everyone).toBe(true);
    expect(extractMentions('@ninguem', members).ids).toEqual([]);
  });

  it('finds the first URL without trailing punctuation', () => {
    expect(firstUrl('olha https://example.com/a.')).toBe('https://example.com/a');
    expect(firstUrl('nada aqui')).toBeNull();
  });
});

describe('drawTeams', () => {
  it('splits everyone into balanced teams', () => {
    const people = Array.from({ length: 7 }, (_, i) => ({ userId: `p${i}` }));
    const teams = drawTeams(people, 3);
    expect(teams).toHaveLength(3);
    expect(teams.flat()).toHaveLength(7);
    expect(new Set(teams.flat().map((p) => p.userId)).size).toBe(7);
    const sizes = teams.map((t) => t.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
});
