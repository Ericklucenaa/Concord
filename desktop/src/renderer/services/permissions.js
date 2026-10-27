// Client-side mirror of the checks in firestore.rules. The rules are the real
// enforcement; these only decide what the UI offers.

export const ROLE_ORDER = ['member', 'moderator', 'admin', 'owner'];

export const ROLE_LABELS = {
  owner: 'Dono',
  admin: 'Admin',
  moderator: 'Moderador',
  member: 'Membro'
};

export function roleOf(server, userId) {
  if (!server || !userId) return null;
  if (server.ownerId === userId) return 'owner';
  return server.roles?.[userId] || (server.memberIds?.includes(userId) ? 'member' : null);
}

export function isAdmin(server, userId) {
  const role = roleOf(server, userId);
  return role === 'owner' || role === 'admin';
}

export function isModerator(server, userId) {
  return isAdmin(server, userId) || roleOf(server, userId) === 'moderator';
}

export function channelAllowedRoles(server, channelId) {
  return server?.channelRoles?.[channelId] || null;
}

export function isChannelReadOnly(server, channelId) {
  return Boolean(server?.readOnlyChannels?.[channelId]);
}

export function canViewChannel(server, userId, channelId) {
  const role = roleOf(server, userId);
  if (!role) return false;
  const allowed = channelAllowedRoles(server, channelId);
  if (!allowed) return true;
  return isAdmin(server, userId) || allowed.includes(role);
}

export function canPostInChannel(server, userId, channelId) {
  if (!canViewChannel(server, userId, channelId)) return false;
  return !isChannelReadOnly(server, channelId) || isModerator(server, userId);
}

/** Can `actorId` act (kick, change role) on `targetId`? Only on lower-ranked members. */
export function outranks(server, actorId, targetId) {
  const actor = ROLE_ORDER.indexOf(roleOf(server, actorId));
  const target = ROLE_ORDER.indexOf(roleOf(server, targetId));
  return actor > target;
}
