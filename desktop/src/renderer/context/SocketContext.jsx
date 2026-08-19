import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { SOCKET_EVENTS } from '@shared/constants';

const SocketContext = createContext(null);

function getSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  if (import.meta.env.VITE_API_URL) {
    // Fall back to the same host used for the REST API, since the Socket.IO
    // server always runs alongside the HTTP API in this project.
    return import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '');
  }
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || !hostname) {
      return 'http://localhost:4000';
    }
    // Hosted web build without an explicit backend URL configured at build time:
    // assume the API/Socket.IO server is reachable on the same origin (reverse proxy).
    return origin;
  }
  return 'http://localhost:4000';
}

const SOCKET_URL = getSocketUrl();

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [userStatuses, setUserStatuses] = useState(new Map());

  useEffect(() => {
    if (!token || !user || !SOCKET_URL) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const socketInstance = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on(SOCKET_EVENTS.USER_PRESENCE_CHANGED, ({ userId, status }) => {
      setUserStatuses((prev) => {
        const next = new Map(prev);
        next.set(userId, status);
        return next;
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token, user?.id]);

  const updateStatus = (status) => {
    if (socket && isConnected) {
      socket.emit(SOCKET_EVENTS.STATUS_UPDATE, { status });
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        userStatuses,
        updateStatus
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
