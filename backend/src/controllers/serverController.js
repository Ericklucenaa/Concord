import { randomUUID } from 'crypto';
import { db } from '../db/database.js';
import { ROLES, CHANNEL_TYPES } from '../../../shared/constants.js';

export async function createServer(req, res) {
  try {
    const { name, description, icon } = req.body;
    const userId = req.user.id;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'O nome do espaço/canal é obrigatório.' });
    }

    const trimmedName = name.trim();
    const serverId = randomUUID();
    const defaultIcon = icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(trimmedName)}`;

    // Create server
    await db.run(
      'INSERT INTO servers (id, name, description, icon, owner_id) VALUES (?, ?, ?, ?, ?)',
      [serverId, trimmedName, description || '', defaultIcon, userId]
    );

    // Add owner to server_members
    await db.run(
      'INSERT INTO server_members (server_id, user_id, role) VALUES (?, ?, ?)',
      [serverId, userId, ROLES.OWNER]
    );

    // Create default text channel
    const textChannelId = randomUUID();
    await db.run(
      'INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)',
      [textChannelId, serverId, 'geral', CHANNEL_TYPES.TEXT]
    );

    // Create default voice channel
    const voiceChannelId = randomUUID();
    await db.run(
      'INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)',
      [voiceChannelId, serverId, 'Sala Geral', CHANNEL_TYPES.VOICE]
    );

    const createdServer = {
      id: serverId,
      name: trimmedName,
      description: description || '',
      icon: defaultIcon,
      ownerId: userId,
      role: ROLES.OWNER,
      channels: [
        { id: textChannelId, serverId, name: 'geral', type: CHANNEL_TYPES.TEXT, isPrivate: false },
        { id: voiceChannelId, serverId, name: 'Sala Geral', type: CHANNEL_TYPES.VOICE, isPrivate: false }
      ]
    };

    return res.status(201).json({
      message: 'Servidor criado com sucesso!',
      server: createdServer
    });
  } catch (err) {
    console.error('Create server error:', err);
    return res.status(500).json({ error: 'Erro ao criar servidor.' });
  }
}

export async function getUserServers(req, res) {
  try {
    const userId = req.user.id;

    const servers = await db.all(
      `SELECT s.id, s.name, s.description, s.icon, s.owner_id as ownerId, s.created_at as createdAt,
              sm.role, sm.muted_by_admin as mutedByAdmin
       FROM servers s
       JOIN server_members sm ON s.id = sm.server_id
       WHERE sm.user_id = ?
       ORDER BY s.created_at DESC`,
      [userId]
    );

    // Fetch channels for each server
    const fullServers = await Promise.all(
      servers.map(async (server) => {
        const channels = await db.all(
          `SELECT id, server_id as serverId, name, type, is_private as isPrivate, created_at as createdAt
           FROM channels WHERE server_id = ? ORDER BY type DESC, name ASC`,
          [server.id]
        );
        return {
          ...server,
          channels
        };
      })
    );

    return res.json({ servers: fullServers });
  } catch (err) {
    console.error('Get user servers error:', err);
    return res.status(500).json({ error: 'Erro ao carregar servidores.' });
  }
}

export async function getServerDetails(req, res) {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    const server = await db.get(
      `SELECT s.id, s.name, s.description, s.icon, s.owner_id as ownerId, s.created_at as createdAt,
              sm.role, sm.muted_by_admin as mutedByAdmin
       FROM servers s
       JOIN server_members sm ON s.id = sm.server_id
       WHERE s.id = ? AND sm.user_id = ?`,
      [serverId, userId]
    );

    if (!server) {
      return res.status(404).json({ error: 'Servidor não encontrado ou você não é membro.' });
    }

    const channels = await db.all(
      `SELECT id, server_id as serverId, name, type, is_private as isPrivate, created_at as createdAt
       FROM channels WHERE server_id = ? ORDER BY type DESC, name ASC`,
      [serverId]
    );

    const members = await db.all(
      `SELECT u.id, u.username, u.avatar, u.status, sm.role, sm.muted_by_admin as mutedByAdmin, sm.joined_at as joinedAt
       FROM server_members sm
       JOIN users u ON sm.user_id = u.id
       WHERE sm.server_id = ?
       ORDER BY 
         CASE sm.role 
           WHEN 'owner' THEN 1 
           WHEN 'admin' THEN 2 
           WHEN 'moderator' THEN 3 
           ELSE 4 
         END,
         u.username ASC`,
      [serverId]
    );

    return res.json({
      server: {
        ...server,
        channels,
        members
      }
    });
  } catch (err) {
    console.error('Get server details error:', err);
    return res.status(500).json({ error: 'Erro ao buscar detalhes do servidor.' });
  }
}

export async function updateServer(req, res) {
  try {
    const { serverId } = req.params;
    const { name, description, icon } = req.body;

    const server = await db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) {
      return res.status(404).json({ error: 'Servidor não encontrado.' });
    }

    const updatedName = name !== undefined ? name.trim() : server.name;
    const updatedDesc = description !== undefined ? description : server.description;
    const updatedIcon = icon !== undefined ? icon : server.icon;

    if (!updatedName) {
      return res.status(400).json({ error: 'Nome do servidor não pode ser vazio.' });
    }

    await db.run(
      'UPDATE servers SET name = ?, description = ?, icon = ? WHERE id = ?',
      [updatedName, updatedDesc, updatedIcon, serverId]
    );

    return res.json({
      message: 'Servidor atualizado com sucesso!',
      server: {
        id: serverId,
        name: updatedName,
        description: updatedDesc,
        icon: updatedIcon
      }
    });
  } catch (err) {
    console.error('Update server error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar servidor.' });
  }
}

export async function deleteServer(req, res) {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    const server = await db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) {
      return res.status(404).json({ error: 'Servidor não encontrado.' });
    }

    if (server.owner_id !== userId) {
      return res.status(403).json({ error: 'Apenas o proprietário pode excluir o servidor.' });
    }

    await db.run('DELETE FROM servers WHERE id = ?', [serverId]);

    return res.json({ message: 'Servidor excluído com sucesso!' });
  } catch (err) {
    console.error('Delete server error:', err);
    return res.status(500).json({ error: 'Erro ao excluir servidor.' });
  }
}

export async function leaveServer(req, res) {
  try {
    const { serverId } = req.params;
    const userId = req.user.id;

    const server = await db.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!server) {
      return res.status(404).json({ error: 'Servidor não encontrado.' });
    }

    if (server.owner_id === userId) {
      return res.status(400).json({ 
        error: 'O proprietário não pode sair do servidor sem transferir a posse ou excluir o servidor.' 
      });
    }

    await db.run('DELETE FROM server_members WHERE server_id = ? AND user_id = ?', [serverId, userId]);

    return res.json({ message: 'Você saiu do servidor.' });
  } catch (err) {
    console.error('Leave server error:', err);
    return res.status(500).json({ error: 'Erro ao sair do servidor.' });
  }
}
