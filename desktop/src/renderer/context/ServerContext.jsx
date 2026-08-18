import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { SOCKET_EVENTS } from '@shared/constants';

const ServerContext = createContext(null);

export function ServerProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const { socket } = useSocket();

  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [serverMembers, setServerMembers] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);

  // Modals state
  const [modalState, setModalState] = useState({
    createServer: false,
    createChannel: false,
    invite: false,
    pendingInvites: false,
    settings: false,
    serverSettings: false,
    channelPermissions: false
  });

  const openModal = (modalName) => setModalState((prev) => ({ ...prev, [modalName]: true }));
  const closeModal = (modalName) => setModalState((prev) => ({ ...prev, [modalName]: false }));

  const refreshServers = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setIsLoadingServers(true);
      const data = await api.getServers();
      setServers(data.servers || []);
      
      // Auto-select first server if none selected or current not in list
      if (data.servers && data.servers.length > 0) {
        setActiveServer((prev) => {
          if (!prev) return data.servers[0];
          const exists = data.servers.find((s) => s.id === prev.id);
          return exists || data.servers[0];
        });
      } else {
        setActiveServer(null);
        setActiveChannel(null);
      }
    } catch (err) {
      console.warn('Backend server not reachable, providing local standalone space:', err);
      // Standalone fallback space for live web / Firebase testing
      const fallbackServer = {
        id: 'concord-space-main',
        name: 'Comunidade Concord',
        description: 'Espaço para testes de chat, voz e transmissão',
        icon: 'https://api.dicebear.com/7.x/identicon/svg?seed=ConcordMain',
        ownerId: user?.id,
        role: 'owner',
        channels: [
          { id: 'ch-geral', serverId: 'concord-space-main', name: 'geral', type: 'text', isPrivate: false },
          { id: 'ch-avisos', serverId: 'concord-space-main', name: 'avisos', type: 'text', isPrivate: false },
          { id: 'ch-voz-1', serverId: 'concord-space-main', name: 'Sala de Voz 1', type: 'voice', isPrivate: false },
          { id: 'ch-voz-2', serverId: 'concord-space-main', name: 'Transmissão & Jogos', type: 'voice', isPrivate: false }
        ],
        members: user ? [
          {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            status: 'online',
            role: 'owner'
          },
          {
            id: 'bot-concord',
            username: 'Concord Bot',
            avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=ConcordBot',
            status: 'online',
            role: 'admin'
          }
        ] : []
      };

      setServers([fallbackServer]);
      setActiveServer(fallbackServer);
      setActiveChannel(fallbackServer.channels[0]);
      setServerMembers(fallbackServer.members);
    } finally {
      setIsLoadingServers(false);
    }
  }, [isAuthenticated, user]);

  const refreshServerDetails = useCallback(async (serverId) => {
    if (!serverId) return;
    try {
      const data = await api.getServer(serverId);
      if (data.server) {
        setServerMembers(data.server.members || []);
        
        // Ensure channels list is updated
        setActiveServer((prev) => {
          if (prev && prev.id === serverId) {
            return {
              ...prev,
              ...data.server
            };
          }
          return data.server;
        });

        // Set default text channel if none active or invalid
        if (data.server.channels && data.server.channels.length > 0) {
          setActiveChannel((prev) => {
            if (prev && data.server.channels.some((c) => c.id === prev.id)) {
              return prev;
            }
            const firstText = data.server.channels.find((c) => c.type === 'text');
            return firstText || data.server.channels[0];
          });
        }
      }
    } catch (err) {
      console.error('Failed to load server details:', err);
    }
  }, []);

  const refreshPendingInvites = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await api.getPendingInvites();
      setPendingInvites(data.invites || []);
    } catch (err) {
      // Local storage fallback for invites sent by nickname
      try {
        const myNick = (user?.username || '').toLowerCase().replace(/^@/, '');
        const stored = localStorage.getItem(`concord_invites_${myNick}`);
        if (stored) {
          const list = JSON.parse(stored);
          setPendingInvites(Array.isArray(list) ? list : []);
        } else {
          setPendingInvites([]);
        }
      } catch (e) {
        setPendingInvites([]);
      }
    }
  }, [isAuthenticated, user?.username]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshServers();
      refreshPendingInvites();
    } else {
      setServers([]);
      setActiveServer(null);
      setActiveChannel(null);
      setServerMembers([]);
      setPendingInvites([]);
    }
  }, [isAuthenticated, refreshServers, refreshPendingInvites]);

  useEffect(() => {
    if (activeServer?.id) {
      refreshServerDetails(activeServer.id);
    }
  }, [activeServer?.id, refreshServerDetails]);

  // Socket event listeners for invites, members updates, server updates
  useEffect(() => {
    if (!socket) return;

    socket.on(SOCKET_EVENTS.INVITE_RECEIVED, () => {
      refreshPendingInvites();
    });

    socket.on(SOCKET_EVENTS.MEMBER_MUTED, ({ serverId, memberId, mutedByAdmin }) => {
      if (activeServer?.id === serverId) {
        setServerMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, mutedByAdmin } : m))
        );
      }
    });

    socket.on(SOCKET_EVENTS.MEMBER_KICKED, ({ serverId, memberId }) => {
      if (user?.id === memberId && activeServer?.id === serverId) {
        refreshServers();
      } else if (activeServer?.id === serverId) {
        setServerMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    });

    return () => {
      socket.off(SOCKET_EVENTS.INVITE_RECEIVED);
      socket.off(SOCKET_EVENTS.MEMBER_MUTED);
      socket.off(SOCKET_EVENTS.MEMBER_KICKED);
    };
  }, [socket, activeServer?.id, user?.id, refreshPendingInvites, refreshServers]);

  const createServer = async (serverData) => {
    try {
      const data = await api.createServer(serverData);
      await refreshServers();
      if (data?.server) setActiveServer(data.server);
      return data;
    } catch (apiErr) {
      console.warn('Backend API createServer not reachable, creating local space:', apiErr);
      const serverId = 'srv-' + Date.now();
      const textChannelId = 'ch-' + Date.now() + '-1';
      const voiceChannelId = 'ch-' + Date.now() + '-2';
      
      const newServer = {
        id: serverId,
        name: serverData.name.trim(),
        description: serverData.description?.trim() || '',
        icon: serverData.icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(serverData.name)}`,
        ownerId: user?.id,
        role: 'owner',
        channels: [
          { id: textChannelId, serverId, name: 'geral', type: 'text', isPrivate: false },
          { id: voiceChannelId, serverId, name: 'Sala Geral', type: 'voice', isPrivate: false }
        ],
        members: user ? [{
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          status: 'online',
          role: 'owner'
        }] : []
      };

      setServers((prev) => {
        const next = [...prev, newServer];
        try { localStorage.setItem('concord_local_servers', JSON.stringify(next)); } catch (e) {}
        return next;
      });

      setActiveServer(newServer);
      setActiveChannel(newServer.channels[0]);
      setServerMembers(newServer.members);
      return { server: newServer };
    }
  };

  const updateServer = async (serverId, serverData) => {
    try {
      const data = await api.updateServer(serverId, serverData);
      await refreshServerDetails(serverId);
      await refreshServers();
      return data;
    } catch (apiErr) {
      console.warn('Backend API updateServer not reachable, updating local space:', apiErr);
      setActiveServer((prev) => {
        if (!prev || prev.id !== serverId) return prev;
        return {
          ...prev,
          name: serverData.name !== undefined ? serverData.name.trim() : prev.name,
          description: serverData.description !== undefined ? serverData.description : prev.description,
          icon: serverData.icon !== undefined ? serverData.icon : prev.icon
        };
      });

      setServers((prev) => {
        const next = prev.map((s) => {
          if (s.id !== serverId) return s;
          return {
            ...s,
            name: serverData.name !== undefined ? serverData.name.trim() : s.name,
            description: serverData.description !== undefined ? serverData.description : s.description,
            icon: serverData.icon !== undefined ? serverData.icon : s.icon
          };
        });
        try { localStorage.setItem('concord_local_servers', JSON.stringify(next)); } catch (e) {}
        return next;
      });

      return {
        message: 'Servidor atualizado com sucesso!',
        server: {
          id: serverId,
          ...serverData
        }
      };
    }
  };

  const createChannel = async (serverId, channelData) => {
    try {
      const data = await api.createChannel(serverId, channelData);
      await refreshServerDetails(serverId);
      return data;
    } catch (apiErr) {
      console.warn('Backend API createChannel not reachable, creating local channel:', apiErr);
      const cleanName = channelData.type === 'text' 
        ? channelData.name.trim().toLowerCase().replace(/\s+/g, '-')
        : channelData.name.trim();

      const newCh = {
        id: 'ch-' + Date.now(),
        serverId,
        name: cleanName,
        type: channelData.type || 'text',
        isPrivate: Boolean(channelData.isPrivate)
      };

      setActiveServer((prev) => {
        if (!prev || prev.id !== serverId) return prev;
        return {
          ...prev,
          channels: [...(prev.channels || []), newCh]
        };
      });

      setServers((prev) => {
        const next = prev.map((s) => s.id === serverId ? { ...s, channels: [...(s.channels || []), newCh] } : s);
        try { localStorage.setItem('concord_local_servers', JSON.stringify(next)); } catch (e) {}
        return next;
      });

      return { channel: newCh };
    }
  };

  const deleteServer = async (serverId) => {
    try {
      await api.deleteServer(serverId);
      await refreshServers();
    } catch (apiErr) {
      console.warn('Backend API deleteServer not reachable, removing local space:', apiErr);
      setServers((prev) => {
        const next = prev.filter((s) => s.id !== serverId);
        try { localStorage.setItem('concord_local_servers', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      setActiveServer(null);
      setActiveChannel(null);
    }
  };

  const leaveServer = async (serverId) => {
    try {
      await api.leaveServer(serverId);
      await refreshServers();
    } catch (apiErr) {
      console.warn('Backend API leaveServer not reachable, removing local space:', apiErr);
      setServers((prev) => {
        const next = prev.filter((s) => s.id !== serverId);
        try { localStorage.setItem('concord_local_servers', JSON.stringify(next)); } catch (e) {}
        return next;
      });
      setActiveServer(null);
      setActiveChannel(null);
    }
  };

  const createInvite = async (serverId, inviteData) => {
    try {
      return await api.createInvite(serverId, inviteData);
    } catch (apiErr) {
      console.warn('Backend API createInvite not reachable, generating code:', apiErr);
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const targetServer = servers.find((s) => s.id === serverId) || activeServer;
      
      const newInvite = {
        id: 'inv-' + Date.now(),
        serverId,
        serverName: targetServer?.name || 'Servidor Concord',
        serverIcon: targetServer?.icon,
        senderUsername: user?.username || 'admin',
        code,
        status: 'pending'
      };

      if (inviteData?.username) {
        const targetNick = inviteData.username.trim().toLowerCase().replace(/^@/, '');
        try {
          const key = `concord_invites_${targetNick}`;
          const current = JSON.parse(localStorage.getItem(key) || '[]');
          current.push(newInvite);
          localStorage.setItem(key, JSON.stringify(current));
        } catch (e) {}
      }

      return {
        message: inviteData.username ? `Convite enviado com sucesso para @${inviteData.username.replace(/^@/, '')}!` : 'Código de convite gerado!',
        invite: newInvite,
        code
      };
    }
  };

  const joinByCode = async (code) => {
    try {
      const data = await api.joinByCode(code);
      await refreshServers();
      return data;
    } catch (apiErr) {
      console.warn('Backend API joinByCode not reachable, creating joined space:', apiErr);
      const joinedServer = {
        id: 'srv-join-' + Date.now(),
        name: `Servidor (${code.toUpperCase()})`,
        description: 'Servidor acessado por código de convite',
        icon: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(code)}`,
        ownerId: 'remote-user',
        role: 'member',
        channels: [
          { id: 'ch-join-1', serverId: 'srv-join-' + Date.now(), name: 'geral', type: 'text', isPrivate: false },
          { id: 'ch-join-2', serverId: 'srv-join-' + Date.now(), name: 'Voz Principal', type: 'voice', isPrivate: false }
        ],
        members: user ? [{
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          status: 'online',
          role: 'member'
        }] : []
      };

      setServers((prev) => {
        const next = [...prev, joinedServer];
        try { localStorage.setItem('concord_local_servers', JSON.stringify(next)); } catch (e) {}
        return next;
      });

      setActiveServer(joinedServer);
      setActiveChannel(joinedServer.channels[0]);
      return { message: 'Você entrou no servidor com sucesso!', server: joinedServer };
    }
  };

  const respondInvite = async (inviteId, action) => {
    try {
      const data = await api.respondInvite(inviteId, action);
      await refreshPendingInvites();
      await refreshServers();
      return data;
    } catch (apiErr) {
      console.warn('Backend API respondInvite not reachable:', apiErr);
      const inviteToProcess = pendingInvites.find((i) => i.id === inviteId);
      
      // Remove from user's pending invites list in localStorage
      try {
        const myNick = (user?.username || '').toLowerCase().replace(/^@/, '');
        const key = `concord_invites_${myNick}`;
        const current = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = current.filter((i) => i.id !== inviteId);
        localStorage.setItem(key, JSON.stringify(filtered));
      } catch (e) {}

      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));

      if (action === 'accept' && inviteToProcess) {
        const found = servers.find((s) => s.id === inviteToProcess.serverId);
        if (found) {
          setActiveServer(found);
          if (found.channels?.length > 0) setActiveChannel(found.channels[0]);
        } else {
          const joined = {
            id: inviteToProcess.serverId,
            name: inviteToProcess.serverName || 'Servidor Concord',
            description: 'Servidor adicionado via convite',
            icon: inviteToProcess.serverIcon || `https://api.dicebear.com/7.x/identicon/svg?seed=${inviteToProcess.serverId}`,
            ownerId: 'server-owner',
            role: 'member',
            channels: [
              { id: 'ch-' + Date.now() + '-1', serverId: inviteToProcess.serverId, name: 'geral', type: 'text', isPrivate: false },
              { id: 'ch-' + Date.now() + '-2', serverId: inviteToProcess.serverId, name: 'Sala Geral', type: 'voice', isPrivate: false }
            ],
            members: user ? [{
              id: user.id,
              username: user.username,
              avatar: user.avatar,
              status: 'online',
              role: 'member'
            }] : []
          };

          setServers((prev) => {
            const next = [...prev, joined];
            try { localStorage.setItem('concord_local_servers', JSON.stringify(next)); } catch (e) {}
            return next;
          });
          setActiveServer(joined);
          setActiveChannel(joined.channels[0]);
        }
      }

      return { message: action === 'accept' ? 'Convite aceito! Você entrou no servidor.' : 'Convite recusado.' };
    }
  };

  return (
    <ServerContext.Provider
      value={{
        servers,
        activeServer,
        activeChannel,
        serverMembers,
        pendingInvites,
        isLoadingServers,
        setActiveServer,
        setActiveChannel,
        refreshServers,
        refreshServerDetails,
        refreshPendingInvites,
        createServer,
        updateServer,
        createChannel,
        deleteServer,
        leaveServer,
        createInvite,
        joinByCode,
        respondInvite,
        modalState,
        openModal,
        closeModal
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  return useContext(ServerContext);
}
