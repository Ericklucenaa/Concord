import { Server } from 'socket.io';
import { randomUUID } from 'crypto';
import { verifySocketToken } from '../middleware/auth.js';
import { db } from '../db/database.js';
import { SOCKET_EVENTS, USER_STATUS, ROLES } from '../../../shared/constants.js';
import { registerIO } from './ioRegistry.js';

// Active voice rooms: Map<channelId, Map<userId, { userId, username, avatar, isMuted, isDeafened, isSpeaking, isScreenSharing, socketId }>>
const voiceRooms = new Map();

// Active user sockets: Map<userId, Set<socketId>>
const userSockets = new Map();

export function setupSocketIO(httpServer, corsOrigin) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*', // Allow desktop Electron and browser clients
      methods: ['GET', 'POST']
    }
  });

  // Socket Auth Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Autenticação necessária.'));
    }

    const decoded = verifySocketToken(token);
    if (!decoded) {
      return next(new Error('Token inválido ou expirado.'));
    }

    socket.user = decoded;
    next();
  });

  // Expose io to REST controllers so they can push realtime updates
  // (server updates, member changes, invite notifications, etc.)
  registerIO(
    io,
    (targetUserId, event, data) => {
      const socketIds = userSockets.get(targetUserId);
      if (socketIds) {
        socketIds.forEach((sId) => io.to(sId).emit(event, data));
      }
    },
    (targetUserId) => userSockets.get(targetUserId)
  );

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    const username = socket.user.username;

    // Track user socket
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);

    // Auto-join a room for every server this user belongs to, so REST-triggered
    // events (server updates, new members, channel changes) reach them live
    // without requiring an explicit join message from the client.
    try {
      const myServers = await db.all('SELECT server_id FROM server_members WHERE user_id = ?', [userId]);
      myServers.forEach((row) => socket.join(`server:${row.server_id}`));
    } catch (err) {
      console.error('Failed to auto-join server rooms:', err);
    }

    // Update status to online in database
    await db.run('UPDATE users SET status = ? WHERE id = ?', [USER_STATUS.ONLINE, userId]);

    // Broadcast presence update to all connected clients
    io.emit(SOCKET_EVENTS.USER_PRESENCE_CHANGED, {
      userId,
      username,
      status: USER_STATUS.ONLINE
    });

    // Helper to send to a specific user by userId
    const sendToUser = (targetUserId, event, data) => {
      const socketIds = userSockets.get(targetUserId);
      if (socketIds) {
        socketIds.forEach((sId) => io.to(sId).emit(event, data));
      }
    };

    // User status update
    socket.on(SOCKET_EVENTS.STATUS_UPDATE, async ({ status }) => {
      if (Object.values(USER_STATUS).includes(status)) {
        await db.run('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
        io.emit(SOCKET_EVENTS.USER_PRESENCE_CHANGED, {
          userId,
          username,
          status
        });
      }
    });

    // Server room join/leave (explicit, in addition to the automatic join above)
    socket.on(SOCKET_EVENTS.SERVER_JOIN, ({ serverId }) => {
      if (serverId) socket.join(`server:${serverId}`);
    });

    socket.on(SOCKET_EVENTS.SERVER_LEAVE, ({ serverId }) => {
      if (serverId) socket.leave(`server:${serverId}`);
    });

    // Chat Channel Join/Leave
    socket.on(SOCKET_EVENTS.CHANNEL_JOIN, ({ channelId }) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on(SOCKET_EVENTS.CHANNEL_LEAVE, ({ channelId }) => {
      socket.leave(`channel:${channelId}`);
    });

    // Chat Message Send
    socket.on(SOCKET_EVENTS.MESSAGE_SEND, async ({ channelId, content }) => {
      if (!content || !content.trim()) return;

      try {
        const cleanContent = content.trim();
        const messageId = randomUUID();

        // Verify channel exists and the sender is actually a member of its server
        const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
        if (!channel) return;

        const member = await db.get(
          'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
          [channel.server_id, userId]
        );
        if (!member) return;

        // Save to DB
        await db.run(
          'INSERT INTO messages (id, channel_id, user_id, content) VALUES (?, ?, ?, ?)',
          [messageId, channelId, userId, cleanContent]
        );

        const user = await db.get('SELECT id, username, avatar FROM users WHERE id = ?', [userId]);

        const messageData = {
          id: messageId,
          channelId,
          userId,
          username: user.username,
          avatar: user.avatar,
          content: cleanContent,
          createdAt: new Date().toISOString()
        };

        // Broadcast to everyone in channel
        io.to(`channel:${channelId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, messageData);
      } catch (err) {
        console.error('Socket message send error:', err);
      }
    });

    // Typing Indicators
    socket.on(SOCKET_EVENTS.TYPING_START, ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit(SOCKET_EVENTS.TYPING_UPDATE, {
        channelId,
        userId,
        username,
        isTyping: true
      });
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit(SOCKET_EVENTS.TYPING_UPDATE, {
        channelId,
        userId,
        username,
        isTyping: false
      });
    });

    // ==========================================
    // WebRTC Voice Rooms & Audio Signaling
    // ==========================================
    socket.on(SOCKET_EVENTS.VOICE_JOIN, async ({ channelId }) => {
      try {
        const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
        if (!channel) return;
        const member = await db.get(
          'SELECT * FROM server_members WHERE server_id = ? AND user_id = ?',
          [channel.server_id, userId]
        );
        if (!member) return;

        socket.join(`voice:${channelId}`);
        socket.currentVoiceChannel = channelId;

        if (!voiceRooms.has(channelId)) {
          voiceRooms.set(channelId, new Map());
        }

        const room = voiceRooms.get(channelId);
        const userDb = await db.get('SELECT avatar FROM users WHERE id = ?', [userId]);

        const participantInfo = {
          userId,
          username,
          avatar: userDb ? userDb.avatar : '',
          isMuted: false,
          isDeafened: false,
          isSpeaking: false,
          isScreenSharing: false,
          socketId: socket.id
        };

        // Add to room first so full list is complete
        room.set(userId, participantInfo);

        // Send full participants list (including joiner) to joiner
        const allParticipants = Array.from(room.values());
        socket.emit(SOCKET_EVENTS.VOICE_USERS_LIST, {
          channelId,
          users: allParticipants
        });

        // Notify other participants in the voice room
        socket.to(`voice:${channelId}`).emit(SOCKET_EVENTS.VOICE_USER_JOINED, {
          channelId,
          user: participantInfo
        });

        // Also notify global/server listeners so channel sidebar shows participants
        io.emit('voice:channel_update', {
          channelId,
          users: allParticipants
        });
      } catch (err) {
        console.error('Voice join error:', err);
      }
    });

    // WebRTC Voice SDP Offer
    socket.on(SOCKET_EVENTS.VOICE_OFFER, ({ targetUserId, channelId, offer }) => {
      sendToUser(targetUserId, SOCKET_EVENTS.VOICE_OFFER, {
        senderUserId: userId,
        channelId,
        offer
      });
    });

    // WebRTC Voice SDP Answer
    socket.on(SOCKET_EVENTS.VOICE_ANSWER, ({ targetUserId, channelId, answer }) => {
      sendToUser(targetUserId, SOCKET_EVENTS.VOICE_ANSWER, {
        senderUserId: userId,
        channelId,
        answer
      });
    });

    // WebRTC Voice ICE Candidate
    socket.on(SOCKET_EVENTS.VOICE_ICE_CANDIDATE, ({ targetUserId, channelId, candidate }) => {
      sendToUser(targetUserId, SOCKET_EVENTS.VOICE_ICE_CANDIDATE, {
        senderUserId: userId,
        channelId,
        candidate
      });
    });

    // Voice Mute / Deafen State Change
    socket.on(SOCKET_EVENTS.VOICE_MUTE_STATE, ({ channelId, isMuted, isDeafened }) => {
      if (voiceRooms.has(channelId)) {
        const room = voiceRooms.get(channelId);
        if (room.has(userId)) {
          const user = room.get(userId);
          user.isMuted = Boolean(isMuted);
          user.isDeafened = Boolean(isDeafened);

          io.to(`voice:${channelId}`).emit(SOCKET_EVENTS.VOICE_MUTE_STATE, {
            channelId,
            userId,
            isMuted: user.isMuted,
            isDeafened: user.isDeafened
          });
        }
      }
    });

    // Voice Speaking State (Web Audio API volume threshold)
    socket.on(SOCKET_EVENTS.VOICE_SPEAKING_STATE, ({ channelId, isSpeaking }) => {
      if (voiceRooms.has(channelId)) {
        const room = voiceRooms.get(channelId);
        if (room.has(userId)) {
          room.get(userId).isSpeaking = Boolean(isSpeaking);

          socket.to(`voice:${channelId}`).emit(SOCKET_EVENTS.VOICE_SPEAKING_STATE, {
            channelId,
            userId,
            isSpeaking: Boolean(isSpeaking)
          });
        }
      }
    });

    // Leave Voice Channel
    socket.on(SOCKET_EVENTS.VOICE_LEAVE, ({ channelId }) => {
      leaveVoiceRoom(socket, channelId || socket.currentVoiceChannel);
    });

    // ==========================================
    // WebRTC Screen Sharing
    // ==========================================
    socket.on(SOCKET_EVENTS.SCREEN_START, ({ channelId, quality, fps }) => {
      if (voiceRooms.has(channelId)) {
        const room = voiceRooms.get(channelId);
        if (room.has(userId)) {
          room.get(userId).isScreenSharing = true;

          io.to(`voice:${channelId}`).emit(SOCKET_EVENTS.SCREEN_STARTED, {
            channelId,
            userId,
            username,
            quality: quality || 'auto',
            fps: fps || 30
          });
        }
      }
    });

    socket.on(SOCKET_EVENTS.SCREEN_STOP, ({ channelId }) => {
      if (voiceRooms.has(channelId)) {
        const room = voiceRooms.get(channelId);
        if (room.has(userId)) {
          room.get(userId).isScreenSharing = false;

          io.to(`voice:${channelId}`).emit(SOCKET_EVENTS.SCREEN_STOPPED, {
            channelId,
            userId
          });
        }
      }
    });

    // Screen Share WebRTC SDP Offer
    socket.on(SOCKET_EVENTS.SCREEN_OFFER, ({ targetUserId, channelId, offer }) => {
      sendToUser(targetUserId, SOCKET_EVENTS.SCREEN_OFFER, {
        senderUserId: userId,
        channelId,
        offer
      });
    });

    // Screen Share WebRTC SDP Answer
    socket.on(SOCKET_EVENTS.SCREEN_ANSWER, ({ targetUserId, channelId, answer }) => {
      sendToUser(targetUserId, SOCKET_EVENTS.SCREEN_ANSWER, {
        senderUserId: userId,
        channelId,
        answer
      });
    });

    // Screen Share WebRTC ICE Candidate
    socket.on(SOCKET_EVENTS.SCREEN_ICE_CANDIDATE, ({ targetUserId, channelId, candidate }) => {
      sendToUser(targetUserId, SOCKET_EVENTS.SCREEN_ICE_CANDIDATE, {
        senderUserId: userId,
        channelId,
        candidate
      });
    });

    // Cleanup on Disconnect
    socket.on('disconnect', async () => {
      if (socket.currentVoiceChannel) {
        leaveVoiceRoom(socket, socket.currentVoiceChannel);
      }

      if (userSockets.has(userId)) {
        const sockets = userSockets.get(userId);
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          // Set user offline
          await db.run('UPDATE users SET status = ? WHERE id = ?', [USER_STATUS.OFFLINE, userId]);
          io.emit(SOCKET_EVENTS.USER_PRESENCE_CHANGED, {
            userId,
            username,
            status: USER_STATUS.OFFLINE
          });
        }
      }
    });
  });

  function leaveVoiceRoom(socket, channelId) {
    if (!channelId || !voiceRooms.has(channelId)) return;

    const userId = socket.user.id;
    const room = voiceRooms.get(channelId);

    if (room.has(userId)) {
      const user = room.get(userId);
      if (user.isScreenSharing) {
        io.to(`voice:${channelId}`).emit(SOCKET_EVENTS.SCREEN_STOPPED, { channelId, userId });
      }

      room.delete(userId);
      socket.leave(`voice:${channelId}`);
      socket.currentVoiceChannel = null;

      io.to(`voice:${channelId}`).emit(SOCKET_EVENTS.VOICE_USER_LEFT, {
        channelId,
        userId
      });

      io.emit('voice:channel_update', {
        channelId,
        users: Array.from(room.values())
      });

      if (room.size === 0) {
        voiceRooms.delete(channelId);
      }
    }
  }

  return io;
}
