import { db } from '../db/database.js';
import { ROLES } from '../../../shared/constants.js';
import { canManageUser, getServerMember } from '../middleware/permissions.js';

export async function updateMemberRole(req, res) {
  try {
    const { serverId, memberId } = req.params;
    const { role } = req.body;
    const actorId = req.user.id;

    if (!role || !Object.values(ROLES).includes(role)) {
      return res.status(400).json({ error: 'Papel inválido.' });
    }

    if (role === ROLES.OWNER) {
      return res.status(400).json({ error: 'Não é possível transferir posse diretamente desta forma.' });
    }

    const actorMember = await getServerMember(serverId, actorId);
    if (!actorMember || (actorMember.role !== ROLES.OWNER && actorMember.role !== ROLES.ADMIN)) {
      return res.status(403).json({ error: 'Apenas proprietários e administradores podem alterar papéis.' });
    }

    // Admins cannot change other Admins or Owners
    if (actorMember.role === ROLES.ADMIN && role === ROLES.ADMIN) {
      return res.status(403).json({ error: 'Apenas o proprietário pode promover outros usuários a administrador.' });
    }

    const canManage = await canManageUser(serverId, actorId, memberId);
    if (!canManage && actorMember.role !== ROLES.OWNER) {
      return res.status(403).json({ error: 'Você não tem permissão para alterar o papel deste usuário.' });
    }

    await db.run(
      'UPDATE server_members SET role = ? WHERE server_id = ? AND user_id = ?',
      [role, serverId, memberId]
    );

    return res.json({
      message: 'Papel do membro atualizado com sucesso!',
      memberId,
      role
    });
  } catch (err) {
    console.error('Update member role error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar papel do membro.' });
  }
}

export async function muteMember(req, res) {
  try {
    const { serverId, memberId } = req.params;
    const { muted } = req.body; // boolean
    const actorId = req.user.id;

    const canManage = await canManageUser(serverId, actorId, memberId);
    const actorMember = await getServerMember(serverId, actorId);

    if (!actorMember || ![ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR].includes(actorMember.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para moderar membros.' });
    }

    if (!canManage && actorMember.role !== ROLES.OWNER) {
      return res.status(403).json({ error: 'Você não tem permissão sobre este usuário.' });
    }

    const isMuted = muted ? 1 : 0;
    await db.run(
      'UPDATE server_members SET muted_by_admin = ? WHERE server_id = ? AND user_id = ?',
      [isMuted, serverId, memberId]
    );

    return res.json({
      message: isMuted ? 'Usuário silenciado pelo moderador/administrador.' : 'Silenciamento removido.',
      memberId,
      mutedByAdmin: Boolean(isMuted)
    });
  } catch (err) {
    console.error('Mute member error:', err);
    return res.status(500).json({ error: 'Erro ao alterar estado de silenciamento do membro.' });
  }
}

export async function kickMember(req, res) {
  try {
    const { serverId, memberId } = req.params;
    const actorId = req.user.id;

    const canManage = await canManageUser(serverId, actorId, memberId);
    const actorMember = await getServerMember(serverId, actorId);

    if (!actorMember || ![ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR].includes(actorMember.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para expulsar membros.' });
    }

    if (!canManage && actorMember.role !== ROLES.OWNER) {
      return res.status(403).json({ error: 'Você não tem permissão para expulsar este usuário.' });
    }

    await db.run(
      'DELETE FROM server_members WHERE server_id = ? AND user_id = ?',
      [serverId, memberId]
    );

    return res.json({ message: 'Membro expulso do servidor com sucesso.', memberId });
  } catch (err) {
    console.error('Kick member error:', err);
    return res.status(500).json({ error: 'Erro ao expulsar membro.' });
  }
}
