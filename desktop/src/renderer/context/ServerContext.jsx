import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import * as servers from '../services/cloud/servers';
import { findUserByNickname } from '../services/cloud/users';
import { canViewChannel } from '../services/permissions';
import { logWarn } from '../services/log';

const ServerContext = createContext(null);

const LAST_CHANNEL_KEY = 'concord_last_channels';

function readLastChannels() {
  try {
    return JSON.parse(localStorage.getItem(LAST_CHANNEL_KEY) || '{}');
  } catch {
    return {};
  }
}

const INITIAL_MODALS = {
  createServer: false,
  createChannel: false,
  invite: false,
  pendingInvites: false,
  settings: false,
  serverSettings: false,
  quickSwitcher: false,
  createGroup: false,
  onboarding: false
};

export function ServerProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id;

  const [serverList, setServerList] = useState([]);
  const [serversLoaded, setServersLoaded] = useState(false);
  const [activeServerId, setActiveServerId] = useState(null);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [selectedChannelForInvite, setSelectedChannelForInvite] = useState(null);
  const [modalState, setModalState] = useState(INITIAL_MODALS);
  const [notice, setNotice] = useState(null);
  // Server to open as soon as the backend confirms it (just created or joined).
  const [pendingSelect, setPendingSelect] = useState(null);
  const [tempChannels, setTempChannels] = useState([]);
  const [events, setEvents] = useState([]);
  const knownServerIds = useRef(new Set());
  const voluntaryExits = useRef(new Set());

  const [categoryForNewChannel, setCategoryForNewChannel] = useState(null);

  const openModal = useCallback((name, data = null) => {
    setModalState((prev) => ({ ...prev, [name]: true }));
    if (name === 'invite') setSelectedChannelForInvite(data);
    if (name === 'createChannel') setCategoryForNewChannel(data);
  }, []);

  const closeModal = useCallback((name) => {
    setModalState((prev) => ({ ...prev, [name]: false }));
    if (name === 'invite') setSelectedChannelForInvite(null);
  }, []);

  // Live list of my servers: channel edits, role changes and kicks show up
  // for everyone immediately.
  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setServerList([]);
      setServersLoaded(false);
      setActiveServerId(null);
      setActiveChannelId(null);
      knownServerIds.current = new Set();
      return undefined;
    }
    return servers.listenToMyServers(userId, (list) => {
      list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      const ids = new Set(list.map((s) => s.id));
      knownServerIds.current.forEach((id) => {
        if (ids.has(id)) return;
        if (voluntaryExits.current.has(id)) voluntaryExits.current.delete(id);
        else setNotice({ type: 'removed', serverId: id, at: Date.now() });
      });
      knownServerIds.current = ids;
      setServerList(list);
      setServersLoaded(true);
    });
  }, [isAuthenticated, userId]);

  useEffect(() => {
    if (!userId) {
      setPendingInvites([]);
      return undefined;
    }
    return servers.listenToMyInvites(userId, setPendingInvites);
  }, [userId]);

  useEffect(() => {
    if (!pendingSelect) return;
    const server = serverList.find((s) => s.id === pendingSelect.serverId);
    if (!server) return;
    setActiveServerId(server.id);
    setActiveChannelId(pendingSelect.channelId || null);
    setPendingSelect(null);
  }, [pendingSelect, serverList]);

  const activeServer = useMemo(
    () => serverList.find((s) => s.id === activeServerId) || null,
    [serverList, activeServerId]
  );

  // Drop out of a server I no longer belong to (left, kicked or deleted).
  useEffect(() => {
    if (activeServerId && serversLoaded && !activeServer) {
      setActiveServerId(null);
      setActiveChannelId(null);
    }
  }, [activeServerId, activeServer, serversLoaded]);

  // Auto-created voice rooms and scheduled events of the server on screen.
  useEffect(() => {
    if (!activeServerId || !activeServer) {
      setTempChannels([]);
      setEvents([]);
      return undefined;
    }
    const unsubs = [
      servers.listenToTempChannels(activeServerId, setTempChannels),
      servers.listenToEvents(activeServerId, setEvents)
    ];
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId, Boolean(activeServer)]);

  const visibleChannels = useMemo(
    () => (activeServer?.channels || []).filter((c) => canViewChannel(activeServer, userId, c.id)),
    [activeServer, userId]
  );

  const activeChannel = useMemo(() => {
    if (!activeServer) return null;
    return visibleChannels.find((c) => c.id === activeChannelId)
      || tempChannels.find((c) => c.id === activeChannelId)
      || null;
  }, [activeServer, visibleChannels, tempChannels, activeChannelId]);

  // Pick a sensible channel when entering a server, or when the current one disappears.
  useEffect(() => {
    if (!activeServer || activeChannel) return;
    const remembered = readLastChannels()[activeServer.id];
    const fallback = visibleChannels.find((c) => c.id === remembered)
      || visibleChannels.find((c) => c.type === 'text')
      || visibleChannels[0];
    if (fallback) setActiveChannelId(fallback.id);
  }, [activeServer, activeChannel, visibleChannels]);

  const setActiveServer = useCallback((server) => {
    setActiveServerId(server?.id || null);
    setActiveChannelId(null);
  }, []);

  const setActiveChannel = useCallback((channel) => {
    setActiveChannelId(channel?.id || null);
    if (channel?.id && activeServerId) {
      try {
        localStorage.setItem(LAST_CHANNEL_KEY, JSON.stringify({ ...readLastChannels(), [activeServerId]: channel.id }));
      } catch (err) {
        logWarn('remember channel', err);
      }
    }
  }, [activeServerId]);

  /** Jumps straight to a channel in any of my servers (quick switcher, mentions). */
  const goToChannel = useCallback((serverId, channelId) => {
    setActiveServerId(serverId);
    setActiveChannelId(channelId);
  }, []);

  const audit = (serverId, action, extra) => servers.logAudit(serverId, user, action, extra);

  // ---------------------------------------------------------------------------
  // Server & channel management
  // ---------------------------------------------------------------------------

  const createServer = async ({ name, description, icon, starter = false }) => {
    const server = await servers.createServer(user, {
      name,
      description,
      icon,
      channels: starter ? servers.starterChannels() : null
    });
    setPendingSelect({ serverId: server.id, channelId: server.channels.find((c) => c.type === 'text')?.id });
    return { server };
  };

  const updateServer = async (serverId, fields) => {
    const clean = {};
    if (fields.name !== undefined) clean.name = fields.name.trim().slice(0, 100);
    if (fields.description !== undefined) clean.description = fields.description.slice(0, 500);
    if (fields.icon !== undefined) clean.icon = fields.icon;
    await servers.updateServerFields(serverId, clean);
    audit(serverId, 'server_update', { details: Object.keys(clean).join(', ') });
    return { message: 'Servidor atualizado com sucesso!' };
  };

  const deleteServer = async (serverId) => {
    voluntaryExits.current.add(serverId);
    await servers.deleteServer(serverId);
    if (activeServerId === serverId) setActiveServer(null);
  };

  const leaveServer = async (serverId) => {
    const server = serverList.find((s) => s.id === serverId);
    if (!server) return;
    voluntaryExits.current.add(serverId);
    await servers.leaveServer(server, userId);
    if (activeServerId === serverId) setActiveServer(null);
  };

  const createChannel = async (serverId, data) => {
    const channel = await servers.addChannel(serverId, data);
    audit(serverId, 'channel_create', { targetId: channel.id, targetName: channel.name });
    return { channel };
  };

  const updateChannel = async (serverId, channelId, data) => {
    await servers.updateChannel(serverId, channelId, data);
    const channel = activeServer?.channels.find((c) => c.id === channelId);
    audit(serverId, 'channel_update', { targetId: channelId, targetName: data.name || channel?.name });
  };

  const deleteChannel = async (serverId, channelId) => {
    const channel = serverList.find((s) => s.id === serverId)?.channels.find((c) => c.id === channelId);
    await servers.deleteChannel(serverId, channelId);
    audit(serverId, 'channel_delete', { targetId: channelId, targetName: channel?.name });
  };

  // ---------------------------------------------------------------------------
  // Members
  // ---------------------------------------------------------------------------

  const memberAction = (fn, action) => async (serverId, target, ...args) => {
    await fn(serverId, target.id, ...args);
    audit(serverId, action, { targetId: target.id, targetName: target.username, details: args.join(', ') });
  };

  const setMemberRole = memberAction(servers.setMemberRole, 'role_change');
  const kickMember = memberAction(servers.kickMember, 'kick');
  const banMember = memberAction(servers.banMember, 'ban');
  const unbanMember = memberAction(servers.unbanMember, 'unban');
  const setMemberMuted = async (serverId, target, muted) => {
    await servers.setMemberMuted(serverId, target.id, muted);
    audit(serverId, muted ? 'voice_mute' : 'voice_unmute', { targetId: target.id, targetName: target.username });
  };
  const transferOwnership = async (serverId, target) => {
    await servers.transferOwnership(serverId, userId, target.id);
    audit(serverId, 'ownership_transfer', { targetId: target.id, targetName: target.username });
  };

  // ---------------------------------------------------------------------------
  // Invites
  // ---------------------------------------------------------------------------

  const createInvite = async (serverId, { username, channelId = null, expiresIn = null, maxUses = null } = {}) => {
    const server = serverList.find((s) => s.id === serverId);
    if (!server) throw new Error('Servidor não encontrado.');

    let receiver = null;
    if (username) {
      const nick = username.trim().replace(/^@/, '');
      if (nick.toLowerCase() === user.username.toLowerCase()) {
        throw new Error('Você não pode enviar um convite para si mesmo.');
      }
      receiver = await findUserByNickname(nick);
      if (!receiver) throw new Error(`Nenhum usuário encontrado com o apelido @${nick}.`);
      if (server.memberIds.includes(receiver.id)) throw new Error(`@${receiver.username} já faz parte deste servidor.`);
    }

    const invite = await servers.createInvite(server, user, {
      channelId,
      // Direct invites to one person are single-use and expire in a week.
      expiresIn: receiver ? servers.INVITE_EXPIRY_OPTIONS['7d'] : expiresIn,
      maxUses: receiver ? 1 : maxUses
    });
    if (receiver) await servers.sendInviteToUser(invite, user, receiver);

    return {
      message: receiver ? `Convite enviado para a caixa de entrada de @${receiver.username}!` : 'Link de convite gerado com sucesso!',
      invite,
      code: invite.code
    };
  };

  const joinByCode = useCallback(async (code) => {
    if (!code?.trim()) throw new Error('Código de convite inválido.');
    const { server, invite, alreadyMember } = await servers.joinServerWithCode(code, userId);
    const target = server.channels.find((c) => c.id === invite.channelId)
      || server.channels.find((c) => c.type === 'text');
    setPendingSelect({ serverId: server.id, channelId: target?.id });
    return {
      message: alreadyMember ? `Você já faz parte de "${server.name}".` : `Você entrou no servidor "${server.name}"!`,
      server
    };
  }, [userId]);

  const respondInvite = async (inviteId, action) => {
    const invite = pendingInvites.find((i) => i.id === inviteId);
    if (!invite) return { message: 'Convite não encontrado.' };
    if (action === 'accept') {
      const result = await joinByCode(invite.code);
      await servers.markUserInvite(inviteId, 'accepted');
      return result;
    }
    await servers.deleteUserInvite(inviteId);
    return { message: 'Convite recusado.' };
  };

  const reorderChannels = (serverId, ordered) => servers.reorderChannels(serverId, ordered);
  const addCategory = async (serverId, name) => {
    const category = await servers.addCategory(serverId, name);
    audit(serverId, 'category_create', { targetId: category.id, targetName: category.name });
    return category;
  };
  const renameCategory = (serverId, categoryId, name) => servers.renameCategory(serverId, categoryId, name);
  const deleteCategory = async (serverId, category) => {
    await servers.deleteCategory(serverId, category.id);
    audit(serverId, 'category_delete', { targetId: category.id, targetName: category.name });
  };

  return (
    <ServerContext.Provider
      value={{
        servers: serverList,
        serversLoaded,
        activeServer,
        activeChannel,
        visibleChannels,
        pendingInvites,
        selectedChannelForInvite,
        categoryForNewChannel,
        modalState,
        notice,
        openModal,
        closeModal,
        setActiveServer,
        setActiveChannel,
        goToChannel,
        createServer,
        updateServer,
        deleteServer,
        leaveServer,
        createChannel,
        updateChannel,
        deleteChannel,
        setMemberRole,
        kickMember,
        banMember,
        unbanMember,
        setMemberMuted,
        transferOwnership,
        createInvite,
        joinByCode,
        respondInvite,
        tempChannels,
        events,
        reorderChannels,
        addCategory,
        renameCategory,
        deleteCategory
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  return useContext(ServerContext);
}
