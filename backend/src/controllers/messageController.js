import { db } from '../db/database.js';
import { ROLES, SOCKET_EVENTS } from '../../../shared/constants.js';
import { getServerMember } from '../middleware/permissions.js';
import { getIO } from '../socket/ioRegistry.js';

export async function getChannelMessages(req, res) {
  try {
    const { channelId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before;

    let query = `
      SELECT m.id, m.channel_id as channelId, m.user_id as userId, m.content, m.created_at as createdAt,
             u.username, u.avatar
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.channel_id = ?
    `;
    const params = [channelId];

    if (before) {
      query += ' AND m.created_at < ?';
      params.push(before);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(limit);

    const messages = await db.all(query, params);

    // Return in chronological order
    return res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('Get channel messages error:', err);
    return res.status(500).json({ error: 'Erro ao buscar mensagens do canal.' });
  }
}

export async function deleteMessage(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await db.get(
      `SELECT m.*, c.server_id 
       FROM messages m 
       JOIN channels c ON m.channel_id = c.id 
       WHERE m.id = ?`,
      [messageId]
    );

    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada.' });
    }

    const member = await getServerMember(message.server_id, userId);
    const isAuthor = message.user_id === userId;
    const isStaff = member && [ROLES.OWNER, ROLES.ADMIN, ROLES.MODERATOR].includes(member.role);

    if (!isAuthor && !isStaff) {
      return res.status(403).json({ error: 'Você não tem permissão para excluir esta mensagem.' });
    }

    await db.run('DELETE FROM messages WHERE id = ?', [messageId]);

    // Notify everyone currently viewing this channel so the message
    // disappears live for them too, not just for whoever clicked delete.
    const io = getIO();
    if (io) {
      io.to(`channel:${message.channel_id}`).emit(SOCKET_EVENTS.MESSAGE_DELETE, {
        messageId,
        channelId: message.channel_id
      });
    }

    return res.json({ message: 'Mensagem excluída com sucesso!', messageId });
  } catch (err) {
    console.error('Delete message error:', err);
    return res.status(500).json({ error: 'Erro ao excluir mensagem.' });
  }
}
