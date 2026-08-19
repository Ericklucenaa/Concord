import { randomUUID } from 'crypto';
import { db } from '../db/database.js';
import { CHANNEL_TYPES, ROLES, SOCKET_EVENTS } from '../../../shared/constants.js';
import { emitToServer } from '../socket/ioRegistry.js';

export async function createChannel(req, res) {
  try {
    const { serverId } = req.params;
    const { name, type, isPrivate } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'O nome do canal é obrigatório.' });
    }

    const channelType = type === CHANNEL_TYPES.VOICE ? CHANNEL_TYPES.VOICE : CHANNEL_TYPES.TEXT;
    const channelId = randomUUID();
    const cleanName = channelType === CHANNEL_TYPES.TEXT 
      ? name.trim().toLowerCase().replace(/\s+/g, '-')
      : name.trim();

    await db.run(
      'INSERT INTO channels (id, server_id, name, type, is_private) VALUES (?, ?, ?, ?, ?)',
      [channelId, serverId, cleanName, channelType, isPrivate ? 1 : 0]
    );

    const channel = {
      id: channelId,
      serverId,
      name: cleanName,
      type: channelType,
      isPrivate: Boolean(isPrivate),
      createdAt: new Date().toISOString()
    };

    emitToServer(serverId, SOCKET_EVENTS.CHANNEL_CREATED, { serverId, channel });

    return res.status(201).json({
      message: 'Canal criado com sucesso!',
      channel
    });
  } catch (err) {
    console.error('Create channel error:', err);
    return res.status(500).json({ error: 'Erro ao criar canal.' });
  }
}

export async function updateChannel(req, res) {
  try {
    const { channelId } = req.params;
    const { name, isPrivate } = req.body;

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Canal não encontrado.' });
    }

    const updatedName = name !== undefined 
      ? (channel.type === CHANNEL_TYPES.TEXT ? name.trim().toLowerCase().replace(/\s+/g, '-') : name.trim())
      : channel.name;

    const updatedPrivate = isPrivate !== undefined ? (isPrivate ? 1 : 0) : channel.is_private;

    await db.run(
      'UPDATE channels SET name = ?, is_private = ? WHERE id = ?',
      [updatedName, updatedPrivate, channelId]
    );

    const updatedChannel = {
      id: channelId,
      serverId: channel.server_id,
      name: updatedName,
      type: channel.type,
      isPrivate: Boolean(updatedPrivate)
    };

    emitToServer(channel.server_id, SOCKET_EVENTS.CHANNEL_UPDATED, { serverId: channel.server_id, channel: updatedChannel });

    return res.json({
      message: 'Canal atualizado com sucesso!',
      channel: updatedChannel
    });
  } catch (err) {
    console.error('Update channel error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar canal.' });
  }
}

export async function deleteChannel(req, res) {
  try {
    const { channelId } = req.params;

    const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
    if (!channel) {
      return res.status(404).json({ error: 'Canal não encontrado.' });
    }

    await db.run('DELETE FROM channels WHERE id = ?', [channelId]);

    emitToServer(channel.server_id, SOCKET_EVENTS.CHANNEL_DELETED, { serverId: channel.server_id, channelId });

    return res.json({ message: 'Canal excluído com sucesso!' });
  } catch (err) {
    console.error('Delete channel error:', err);
    return res.status(500).json({ error: 'Erro ao excluir canal.' });
  }
}

export async function getChannelPermissions(req, res) {
  try {
    const { channelId } = req.params;

    const permissions = await db.all(
      'SELECT id, channel_id as channelId, role, can_view as canView, can_send_messages as canSendMessages, can_connect_voice as canConnectVoice, can_speak as canSpeak, can_share_screen as canShareScreen FROM channel_permissions WHERE channel_id = ?',
      [channelId]
    );

    return res.json({ permissions });
  } catch (err) {
    console.error('Get channel permissions error:', err);
    return res.status(500).json({ error: 'Erro ao buscar permissões do canal.' });
  }
}

export async function updateChannelPermissions(req, res) {
  try {
    const { channelId } = req.params;
    const { role, canView, canSendMessages, canConnectVoice, canSpeak, canShareScreen } = req.body;

    if (!role || !Object.values(ROLES).includes(role)) {
      return res.status(400).json({ error: 'Papel (role) inválido.' });
    }

    const existing = await db.get(
      'SELECT id FROM channel_permissions WHERE channel_id = ? AND role = ?',
      [channelId, role]
    );

    if (existing) {
      await db.run(
        `UPDATE channel_permissions 
         SET can_view = ?, can_send_messages = ?, can_connect_voice = ?, can_speak = ?, can_share_screen = ?
         WHERE channel_id = ? AND role = ?`,
        [
          canView ? 1 : 0,
          canSendMessages ? 1 : 0,
          canConnectVoice ? 1 : 0,
          canSpeak ? 1 : 0,
          canShareScreen ? 1 : 0,
          channelId,
          role
        ]
      );
    } else {
      const permId = randomUUID();
      await db.run(
        `INSERT INTO channel_permissions (id, channel_id, role, can_view, can_send_messages, can_connect_voice, can_speak, can_share_screen)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          permId,
          channelId,
          role,
          canView ? 1 : 0,
          canSendMessages ? 1 : 0,
          canConnectVoice ? 1 : 0,
          canSpeak ? 1 : 0,
          canShareScreen ? 1 : 0
        ]
      );
    }

    return res.json({ message: 'Permissões do canal atualizadas com sucesso!' });
  } catch (err) {
    console.error('Update channel permissions error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar permissões do canal.' });
  }
}
