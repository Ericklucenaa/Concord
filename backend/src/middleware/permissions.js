import { db } from '../db/database.js';
import { ROLES } from '../../../shared/constants.js';

const ROLE_PRIORITY = {
  [ROLES.OWNER]: 4,
  [ROLES.ADMIN]: 3,
  [ROLES.MODERATOR]: 2,
  [ROLES.MEMBER]: 1
};

export async function getServerMember(serverId, userId) {
  return await db.get(
    'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
    [serverId, userId]
  );
}

export function requireServerRole(allowedRoles = []) {
  return async (req, res, next) => {
    const serverId = req.params.serverId || req.body.serverId;
    if (!serverId) {
      return res.status(400).json({ error: 'ID do servidor não especificado.' });
    }

    const member = await getServerMember(serverId, req.user.id);
    if (!member) {
      return res.status(403).json({ error: 'Você não é membro deste servidor.' });
    }

    req.serverMember = member;

    if (member.role === ROLES.OWNER) {
      return next(); // Owner has all permissions
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(member.role)) {
      return res.status(403).json({ 
        error: 'Você não tem permissão para realizar esta ação.' 
      });
    }

    next();
  };
}

export async function canManageUser(targetServerId, actorUserId, targetUserId) {
  if (actorUserId === targetUserId) return false;

  const actorMember = await getServerMember(targetServerId, actorUserId);
  const targetMember = await getServerMember(targetServerId, targetUserId);

  if (!actorMember || !targetMember) return false;

  const actorPower = ROLE_PRIORITY[actorMember.role] || 0;
  const targetPower = ROLE_PRIORITY[targetMember.role] || 0;

  return actorPower > targetPower;
}

export async function checkChannelPermission(channelId, userId, permissionKey) {
  const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
  if (!channel) return false;

  const member = await getServerMember(channel.server_id, userId);
  if (!member) return false;

  if (member.role === ROLES.OWNER || member.role === ROLES.ADMIN) return true;

  // Check specific channel permission
  const perm = await db.get(
    'SELECT * FROM channel_permissions WHERE channel_id = ? AND role = ?',
    [channelId, member.role]
  );

  if (perm && perm[permissionKey] !== undefined) {
    return Boolean(perm[permissionKey]);
  }

  // Default permissions if not overridden
  return true;
}
