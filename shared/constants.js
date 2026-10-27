// Constants shared by the desktop/web client.

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  MEMBER: 'member'
};

export const CHANNEL_TYPES = {
  TEXT: 'text',
  VOICE: 'voice'
};

export const USER_STATUS = {
  ONLINE: 'online',
  IDLE: 'idle',
  DND: 'dnd',
  INVISIBLE: 'invisible',
  OFFLINE: 'offline'
};

// Public STUN servers. A TURN relay can be added at build time, see
// desktop/src/renderer/services/iceServers.js.
export const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];
