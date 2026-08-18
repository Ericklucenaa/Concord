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
      console.error('Failed to load pending invites:', err);
    }
  }, [isAuthenticated]);

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
