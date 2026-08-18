import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { SOCKET_EVENTS } from '@shared/constants';
import { 
  saveServerToCloud, 
  getServerFromCloud, 
  getUserServersFromCloud, 
  saveInviteToCloud, 
  getInviteByCodeFromCloud, 
  joinServerInCloud, 
  getPendingInvitesFromCloud, 
  findUserByNicknameInCloud,
  respondInviteInCloud 
} from '../services/cloudSync';

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
      if (data?.servers && data.servers.length > 0) {
        setServers(data.servers);
        setActiveServer((prev) => {
          if (!prev) return data.servers[0];
          const exists = data.servers.find((s) => s.id === prev.id);
          return exists || data.servers[0];
        });
        return;
      }
      throw new Error('No servers from backend API');
    } catch (err) {
      // Cloud Firestore + LocalStorage sync
      let combinedServers = [];
      try {
        const cloudServers = await getUserServersFromCloud(user?.id, user?.username);
        const storedLocal = JSON.parse(localStorage.getItem('concord_local_servers') || '[]');
        
        const serverMap = new Map();
        cloudServers.forEach((s) => serverMap.set(String(s.id), s));
        storedLocal.forEach((s) => {
          if (!serverMap.has(String(s.id))) serverMap.set(String(s.id), s);
        });

        combinedServers = Array.from(serverMap.values());
      } catch (cloudErr) {
        console.warn('Cloud server sync note:', cloudErr);
      }

      if (combinedServers.length === 0) {
        // Create initial default server for user
        const initialServer = {
          id: 'concord-space-' + (user?.id ? String(user.id).substring(0, 8) : Date.now()),
          name: user?.username ? `Servidor de ${user.username}` : 'Comunidade Concord',
          description: 'Espaço oficial para chat, voz e transmissões ao vivo',
          icon: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(user?.username || 'Concord')}`,
          ownerId: user?.id || 'owner',
          role: 'owner',
          channels: [
            { id: 'ch-geral-' + Date.now(), serverId: 'concord-space-main', name: 'geral', type: 'text', isPrivate: false },
            { id: 'ch-avisos-' + Date.now(), serverId: 'concord-space-main', name: 'avisos', type: 'text', isPrivate: false },
            { id: 'ch-voz-1-' + Date.now(), serverId: 'concord-space-main', name: 'Sala de Voz 1', type: 'voice', isPrivate: false },
            { id: 'ch-voz-2-' + Date.now(), serverId: 'concord-space-main', name: 'Transmissão & Jogos', type: 'voice', isPrivate: false }
          ],
          members: user ? [
            {
              id: String(user.id),
              username: user.username,
              avatar: user.avatar,
              status: 'online',
              role: 'owner'
            }
          ] : []
        };

        saveServerToCloud(initialServer);
        combinedServers = [initialServer];
        try { localStorage.setItem('concord_local_servers', JSON.stringify(combinedServers)); } catch (e) {}
      }

      setServers(combinedServers);
      setActiveServer((prev) => {
        if (!prev) return combinedServers[0];
        const exists = combinedServers.find((s) => s.id === prev.id);
        return exists || combinedServers[0];
      });
      if (combinedServers[0]?.channels?.length > 0) {
        setActiveChannel((prev) => {
          if (prev && combinedServers[0].channels.some((c) => c.id === prev.id)) return prev;
          return combinedServers[0].channels[0];
        });
      }
      setServerMembers(combinedServers[0]?.members || []);
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
        setActiveServer((prev) => (prev && prev.id === serverId ? { ...prev, ...data.server } : data.server));
        if (data.server.channels?.length > 0) {
          setActiveChannel((prev) => {
            if (prev && data.server.channels.some((c) => c.id === prev.id)) return prev;
            return data.server.channels[0];
          });
        }
        return;
      }
    } catch (err) {
      // Cloud fallback
      try {
        const cloudServer = await getServerFromCloud(serverId);
        if (cloudServer) {
          setServerMembers(cloudServer.members || []);
          setActiveServer((prev) => (prev && prev.id === serverId ? { ...prev, ...cloudServer } : cloudServer));
          if (cloudServer.channels?.length > 0) {
            setActiveChannel((prev) => {
              if (prev && cloudServer.channels.some((c) => c.id === prev.id)) return prev;
              return cloudServer.channels[0];
            });
          }
        }
      } catch (e) {}
    }
  }, []);

  const refreshPendingInvites = useCallback(async () => {
    if (!isAuthenticated || !user?.username) return;
    try {
      const data = await api.getPendingInvites();
      if (data?.invites) {
        setPendingInvites(data.invites);
        return;
      }
    } catch (err) {
      // Cloud + local invites
      try {
        const cloudInvites = await getPendingInvitesFromCloud(user.username);
        const myNick = (user.username || '').toLowerCase().replace(/^@/, '');
        const stored = localStorage.getItem(`concord_invites_${myNick}`);
        const localList = stored ? JSON.parse(stored) : [];

        const inviteMap = new Map();
        cloudInvites.forEach((i) => inviteMap.set(i.id || i.code, i));
        localList.forEach((i) => {
          const key = i.id || i.code;
          if (!inviteMap.has(key)) inviteMap.set(key, i);
        });

        setPendingInvites(Array.from(inviteMap.values()));
      } catch (e) {
        setPendingInvites([]);
      }
    }
  }, [isAuthenticated, user?.username]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshServers();
      refreshPendingInvites();

      const handleIncomingInvite = () => {
        refreshPendingInvites();
      };

      window.addEventListener('storage', handleIncomingInvite);
      window.addEventListener('concord:invite_created', handleIncomingInvite);
      return () => {
        window.removeEventListener('storage', handleIncomingInvite);
        window.removeEventListener('concord:invite_created', handleIncomingInvite);
      };
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

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on(SOCKET_EVENTS.SERVER_UPDATED, ({ server }) => {
      setServers((prev) => prev.map((s) => s.id === server.id ? { ...s, ...server } : s));
      setActiveServer((prev) => prev?.id === server.id ? { ...prev, ...server } : prev);
    });

    socket.on(SOCKET_EVENTS.SERVER_DELETED, ({ serverId }) => {
      setServers((prev) => prev.filter((s) => s.id !== serverId));
      setActiveServer((prev) => prev?.id === serverId ? null : prev);
      setActiveChannel(null);
    });

    socket.on(SOCKET_EVENTS.MEMBER_JOINED, ({ serverId, member }) => {
      if (activeServer?.id === serverId) {
        setServerMembers((prev) => [...prev.filter((m) => m.id !== member.id), member]);
      }
    });

    socket.on(SOCKET_EVENTS.MEMBER_LEFT, ({ serverId, userId }) => {
      if (activeServer?.id === serverId) {
        setServerMembers((prev) => prev.filter((m) => m.id !== userId));
      }
    });

    socket.on(SOCKET_EVENTS.MEMBER_UPDATED, ({ serverId, member }) => {
      if (activeServer?.id === serverId) {
        setServerMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, ...member } : m));
      }
    });

    socket.on(SOCKET_EVENTS.CHANNEL_CREATED, ({ serverId, channel }) => {
      if (activeServer?.id === serverId) {
        setActiveServer((prev) => ({
          ...prev,
          channels: [...(prev.channels || []), channel]
        }));
      }
    });

    socket.on(SOCKET_EVENTS.CHANNEL_DELETED, ({ serverId, channelId }) => {
      if (activeServer?.id === serverId) {
        setActiveServer((prev) => ({
          ...prev,
          channels: prev.channels?.filter((c) => c.id !== channelId) || []
        }));
        setActiveChannel((prev) => prev?.id === channelId ? null : prev);
      }
    });

    socket.on(SOCKET_EVENTS.INVITE_RECEIVED, () => {
      refreshPendingInvites();
    });

    return () => {
      socket.off(SOCKET_EVENTS.SERVER_UPDATED);
      socket.off(SOCKET_EVENTS.SERVER_DELETED);
      socket.off(SOCKET_EVENTS.MEMBER_JOINED);
      socket.off(SOCKET_EVENTS.MEMBER_LEFT);
      socket.off(SOCKET_EVENTS.MEMBER_UPDATED);
      socket.off(SOCKET_EVENTS.CHANNEL_CREATED);
      socket.off(SOCKET_EVENTS.CHANNEL_DELETED);
      socket.off(SOCKET_EVENTS.INVITE_RECEIVED);
    };
  }, [socket, activeServer?.id, refreshPendingInvites]);

  const createServer = async (serverData) => {
    try {
      const data = await api.createServer(serverData);
      await refreshServers();
      if (data.server) {
        setActiveServer(data.server);
        saveServerToCloud(data.server);
      }
      return data;
    } catch (apiErr) {
      console.warn('Backend API createServer not reachable, creating cloud & local server:', apiErr);
      const newId = 'srv-' + Date.now();
      const newServer = {
        id: newId,
        name: serverData.name.trim(),
        description: serverData.description?.trim() || '',
        icon: serverData.icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(serverData.name)}`,
        ownerId: user?.id || 'owner',
        role: 'owner',
        channels: [
          { id: 'ch-' + Date.now() + '-1', serverId: newId, name: 'geral', type: 'text', isPrivate: false },
          { id: 'ch-' + Date.now() + '-2', serverId: newId, name: 'Sala Geral', type: 'voice', isPrivate: false }
        ],
        members: user ? [
          {
            id: String(user.id),
            username: user.username,
            avatar: user.avatar,
            status: 'online',
            role: 'owner'
          }
        ] : [],
        createdAt: new Date().toISOString()
      };

      saveServerToCloud(newServer);

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
      console.warn('Backend API updateServer not reachable, updating space:', apiErr);
      let updatedServer = null;

      setActiveServer((prev) => {
        if (!prev || prev.id !== serverId) return prev;
        updatedServer = {
          ...prev,
          name: serverData.name !== undefined ? serverData.name.trim() : prev.name,
          description: serverData.description !== undefined ? serverData.description : prev.description,
          icon: serverData.icon !== undefined ? serverData.icon : prev.icon
        };
        saveServerToCloud(updatedServer);
        return updatedServer;
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
        server: updatedServer
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
        const updated = {
          ...prev,
          channels: [...(prev.channels || []), newCh]
        };
        saveServerToCloud(updated);
        return updated;
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
      console.warn('Backend API deleteServer not reachable, removing space:', apiErr);
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
      console.warn('Backend API leaveServer not reachable, removing space:', apiErr);
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
      console.warn('Backend API createInvite not reachable, creating real cloud invite:', apiErr);
      
      const targetServer = servers.find((s) => s.id === serverId) || activeServer;
      if (!targetServer) {
        throw new Error('Servidor não encontrado.');
      }

      let receiverUser = null;
      if (inviteData?.username) {
        const cleanTarget = inviteData.username.trim().replace(/^@/, '');
        if (!cleanTarget) {
          throw new Error('Informe o apelido do usuário para convidar.');
        }

        if (user?.username && cleanTarget.toLowerCase() === user.username.toLowerCase()) {
          throw new Error('Você não pode enviar um convite para o seu próprio apelido.');
        }

        receiverUser = await findUserByNicknameInCloud(cleanTarget);
        if (!receiverUser) {
          throw new Error(`O apelido @${cleanTarget} não existe. Verifique se digitou corretamente.`);
        }
      }

      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      const newInvite = {
        id: 'inv-' + Date.now(),
        serverId: targetServer.id,
        serverName: targetServer.name,
        serverIcon: targetServer.icon,
        serverDescription: targetServer.description || '',
        senderUsername: user?.username || 'admin',
        receiverUsername: receiverUser ? receiverUser.username : (inviteData?.username ? inviteData.username.replace(/^@/, '') : null),
        code,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // Save invite and server to Firestore cloud
      await saveInviteToCloud(newInvite);
      await saveServerToCloud(targetServer);

      if (newInvite.receiverUsername) {
        const targetNick = newInvite.receiverUsername.toLowerCase();
        try {
          const key = `concord_invites_${targetNick}`;
          const current = JSON.parse(localStorage.getItem(key) || '[]');
          current.push(newInvite);
          localStorage.setItem(key, JSON.stringify(current));
          window.dispatchEvent(new Event('concord:invite_created'));
        } catch (e) {}
      }

      return {
        message: newInvite.receiverUsername 
          ? `Convite enviado com sucesso para a caixa de mensagens de @${newInvite.receiverUsername}!` 
          : 'Link de convite gerado com sucesso!',
        invite: newInvite,
        code
      };
    }
  };

  const joinByCode = async (code) => {
    if (!code || !code.trim()) {
      throw new Error('Código de convite inválido.');
    }

    const cleanCode = code.trim().toUpperCase();

    try {
      const data = await api.joinByCode(cleanCode);
      await refreshServers();
      return data;
    } catch (apiErr) {
      console.warn('Backend API joinByCode not reachable, searching cloud invite:', apiErr);
      
      // Look up real server in Firestore cloud
      const cloudData = await getInviteByCodeFromCloud(cleanCode);
      
      if (cloudData && cloudData.server) {
        const realServer = cloudData.server;
        const joinedServer = await joinServerInCloud(realServer.id, user) || realServer;

        setServers((prev) => {
          const filtered = prev.filter((s) => s.id !== joinedServer.id);
          const next = [...filtered, joinedServer];
          try { localStorage.setItem('concord_local_servers', JSON.stringify(next)); } catch (e) {}
          return next;
        });

        setActiveServer(joinedServer);
        if (joinedServer.channels?.length > 0) {
          const firstText = joinedServer.channels.find((c) => c.type === 'text');
          setActiveChannel(firstText || joinedServer.channels[0]);
        }

        return { 
          message: `Você entrou no servidor "${joinedServer.name}"!`, 
          server: joinedServer 
        };
      }

      // Check local storage for invite code
      const localServers = JSON.parse(localStorage.getItem('concord_local_servers') || '[]');
      const matching = localServers.find((s) => s.inviteCodes?.includes(cleanCode) || s.id === cleanCode);
      
      if (matching) {
        setActiveServer(matching);
        if (matching.channels?.length > 0) setActiveChannel(matching.channels[0]);
        return { message: `Você entrou no servidor "${matching.name}"!`, server: matching };
      }

      throw new Error('Código de convite inválido ou servidor não encontrado.');
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
      const inviteToProcess = pendingInvites.find((i) => i.id === inviteId || i.code === inviteId);

      await respondInviteInCloud(inviteId, action, user);

      // Remove from user's pending invites list in localStorage
      try {
        const myNick = (user?.username || '').toLowerCase().replace(/^@/, '');
        const key = `concord_invites_${myNick}`;
        const current = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = current.filter((i) => i.id !== inviteId && i.code !== inviteId);
        localStorage.setItem(key, JSON.stringify(filtered));
      } catch (e) {}

      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId && i.code !== inviteId));

      if (action === 'accept' && inviteToProcess) {
        try {
          const realServer = await getServerFromCloud(inviteToProcess.serverId);
          if (realServer) {
            const joinedServer = await joinServerInCloud(realServer.id, user) || realServer;
            setServers((prev) => {
              const filtered = prev.filter((s) => s.id !== joinedServer.id);
              const next = [...filtered, joinedServer];
              try { localStorage.setItem('concord_local_servers', JSON.stringify(next)); } catch (e) {}
              return next;
            });
            setActiveServer(joinedServer);
            if (joinedServer.channels?.length > 0) {
              const firstText = joinedServer.channels.find((c) => c.type === 'text');
              setActiveChannel(firstText || joinedServer.channels[0]);
            }
            return { message: `Você entrou no servidor "${joinedServer.name}"!`, serverId: joinedServer.id };
          }
        } catch (e) {
          console.warn('Join server from invite error:', e);
        }
      }

      return { message: action === 'accept' ? 'Convite aceito!' : 'Convite recusado.' };
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
        modalState,
        openModal,
        closeModal,
        setActiveServer,
        setActiveChannel,
        refreshServers,
        refreshServerDetails,
        refreshPendingInvites,
        createServer,
        updateServer,
        deleteServer,
        leaveServer,
        createChannel,
        createInvite,
        joinByCode,
        respondInvite
      }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  return useContext(ServerContext);
}
