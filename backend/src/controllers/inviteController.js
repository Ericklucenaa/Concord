import { randomUUID } from 'crypto';
import { db } from '../db/database.js';
import { INVITE_STATUS, ROLES, SOCKET_EVENTS } from '../../../shared/constants.js';
import { emitToUser, emitToServer, joinUserToServerRoom } from '../socket/ioRegistry.js';

function generateRandomCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createInvite(req, res) {
  try {
    const { serverId } = req.params;
    const { username, channelId } = req.body;
    const senderId = req.user.id;

    const server = await db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) {
      return res.status(404).json({ error: 'Servidor não encontrado.' });
    }

    let receiverUser = null;
    if (username) {
      const cleanUsername = username.replace(/^@/, '').trim();
      if (!cleanUsername) {
        return res.status(400).json({ error: 'Informe o apelido do usuário para convidar.' });
      }

      receiverUser = await db.get('SELECT id, username, email FROM users WHERE username = ? COLLATE NOCASE', [cleanUsername]);
      if (!receiverUser) {
        return res.status(404).json({ error: `O apelido @${cleanUsername} não existe. Verifique se digitou corretamente.` });
      }

      if (receiverUser.id === senderId) {
        return res.status(400).json({ error: 'Você não pode enviar um convite para o seu próprio apelido.' });
      }

      // Check if user is already in the server
      const alreadyMember = await db.get(
        'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
        [serverId, receiverUser.id]
      );
      if (alreadyMember) {
        return res.status(400).json({ error: `@${cleanUsername} já faz parte deste servidor.` });
      }
    }

    const inviteId = randomUUID();
    const code = generateRandomCode(8).toUpperCase();

    await db.run(
      'INSERT INTO invites (id, server_id, sender_id, receiver_id, code, status, channel_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [inviteId, serverId, senderId, receiverUser ? receiverUser.id : null, code, INVITE_STATUS.PENDING, channelId || null]
    );

    const invite = {
      id: inviteId,
      serverId,
      serverName: server.name,
      senderId,
      senderUsername: req.user.username,
      receiverId: receiverUser ? receiverUser.id : null,
      receiverUsername: receiverUser ? receiverUser.username : null,
      code,
      status: INVITE_STATUS.PENDING,
      channelId: channelId || null,
      createdAt: new Date().toISOString()
    };

    // Notify the receiver in real time so it shows up instantly in their invite inbox,
    // instead of only appearing after they manually reopen the app.
    if (receiverUser) {
      emitToUser(receiverUser.id, SOCKET_EVENTS.INVITE_RECEIVED, invite);
    }

    return res.status(201).json({
      message: receiverUser ? `Convite enviado para @${receiverUser.username}!` : 'Código de convite gerado com sucesso!',
      invite
    });
  } catch (err) {
    console.error('Create invite error:', err);
    return res.status(500).json({ error: 'Erro ao criar convite.' });
  }
}

export async function joinByCode(req, res) {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code || code.trim().length === 0) {
      return res.status(400).json({ error: 'Código de convite obrigatório.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const invite = await db.get('SELECT * FROM invites WHERE code = ?', [cleanCode]);

    if (!invite) {
      return res.status(404).json({ error: 'Convite inválido ou expirado.' });
    }

    const server = await db.get('SELECT * FROM servers WHERE id = ?', [invite.server_id]);
    if (!server) {
      return res.status(404).json({ error: 'Servidor associado ao convite não existe mais.' });
    }

    // Check if already a member
    const existing = await db.get(
      'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
      [invite.server_id, userId]
    );

    if (existing) {
      return res.status(400).json({ error: 'Você já faz parte deste servidor.' });
    }

    await db.run(
      'INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)',
      [invite.server_id, userId, ROLES.MEMBER]
    );

    const newMember = await db.get(
      'SELECT id, username, avatar, status FROM users WHERE id = ?',
      [userId]
    );

    joinUserToServerRoom(userId, invite.server_id);
    emitToServer(invite.server_id, SOCKET_EVENTS.MEMBER_JOINED, {
      serverId: invite.server_id,
      member: { ...newMember, role: ROLES.MEMBER }
    });

    return res.json({
      message: `Você entrou no servidor ${server.name}!`,
      serverId: server.id,
      channelId: invite.channel_id || null
    });
  } catch (err) {
    console.error('Join by code error:', err);
    return res.status(500).json({ error: 'Erro ao entrar pelo código de convite.' });
  }
}

export async function getPendingInvites(req, res) {
  try {
    const userId = req.user.id;

    const invites = await db.all(
      `SELECT i.id, i.server_id as serverId, i.code, i.status, i.created_at as createdAt,
              s.name as serverName, s.icon as serverIcon, s.description as serverDescription,
              u.username as senderUsername, u.avatar as senderAvatar
       FROM invites i
       JOIN servers s ON i.server_id = s.id
       JOIN users u ON i.sender_id = u.id
       WHERE i.receiver_id = ? AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [userId]
    );

    return res.json({ invites });
  } catch (err) {
    console.error('Get pending invites error:', err);
    return res.status(500).json({ error: 'Erro ao buscar convites pendentes.' });
  }
}

export async function respondInvite(req, res) {
  try {
    const { inviteId } = req.params;
    const { action } = req.body; // 'accept' or 'reject'
    const userId = req.user.id;

    const invite = await db.get('SELECT * FROM invites WHERE id = ? AND receiver_id = ?', [inviteId, userId]);
    if (!invite) {
      return res.status(404).json({ error: 'Convite não encontrado.' });
    }

    if (invite.status !== INVITE_STATUS.PENDING) {
      return res.status(400).json({ error: 'Este convite já foi respondido.' });
    }

    if (action === 'accept') {
      await db.run('UPDATE invites SET status = ? WHERE id = ?', [INVITE_STATUS.ACCEPTED, inviteId]);

      // Check if already a member
      const existing = await db.get(
        'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
        [invite.server_id, userId]
      );

      if (!existing) {
        await db.run(
          'INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)',
          [invite.server_id, userId, ROLES.MEMBER]
        );
      }

      const server = await db.get('SELECT * FROM servers WHERE id = ?', [invite.server_id]);

      return res.json({
        message: `Convite aceito! Bem-vindo(a) ao servidor ${server ? server.name : ''}.`,
        serverId: invite.server_id
      });
    } else if (action === 'reject') {
      await db.run('UPDATE invites SET status = ? WHERE id = ?', [INVITE_STATUS.REJECTED, inviteId]);
      return res.json({ message: 'Convite recusado.' });
    } else {
      return res.status(400).json({ error: 'Ação inválida. Use accept ou reject.' });
    }
  } catch (err) {
    console.error('Respond invite error:', err);
    return res.status(500).json({ error: 'Erro ao responder convite.' });
  }
}
