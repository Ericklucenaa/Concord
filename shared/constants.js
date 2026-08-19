// Shared constants between Backend and Desktop Frontend

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
  OFFLINE: 'offline'
};

export const INVITE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected'
};

export const SOCKET_EVENTS = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  UNAUTHORIZED: 'unauthorized',

  // Presence
  STATUS_UPDATE: 'status:update',
  USER_PRESENCE_CHANGED: 'user:presence_changed',

  // Server & Channel
  SERVER_JOIN: 'server:join',
  SERVER_LEAVE: 'server:leave',
  SERVER_UPDATED: 'server:updated',
  SERVER_DELETED: 'server:deleted',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  MEMBER_UPDATED: 'member:updated',
  MEMBER_KICKED: 'member:kicked',
  MEMBER_MUTED: 'member:muted',
  CHANNEL_CREATED: 'channel:created',
  CHANNEL_DELETED: 'channel:deleted',
  CHANNEL_UPDATED: 'channel:updated',

  // Chat
  CHANNEL_JOIN: 'channel:join',
  CHANNEL_LEAVE: 'channel:leave',
  MESSAGE_SEND: 'message:send',
  MESSAGE_NEW: 'message:new',
  MESSAGE_DELETE: 'message:delete',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  TYPING_UPDATE: 'typing:update',

  // Voice WebRTC
  VOICE_JOIN: 'voice:join',
  VOICE_LEAVE: 'voice:leave',
  VOICE_USER_JOINED: 'voice:user_joined',
  VOICE_USER_LEFT: 'voice:user_left',
  VOICE_USERS_LIST: 'voice:users_list',
  VOICE_OFFER: 'voice:offer',
  VOICE_ANSWER: 'voice:answer',
  VOICE_ICE_CANDIDATE: 'voice:ice_candidate',
  VOICE_MUTE_STATE: 'voice:mute_state',
  VOICE_SPEAKING_STATE: 'voice:speaking_state',

  // Screen Share WebRTC
  SCREEN_START: 'screen:start',
  SCREEN_STOP: 'screen:stop',
  SCREEN_STARTED: 'screen:started',
  SCREEN_STOPPED: 'screen:stopped',
  SCREEN_OFFER: 'screen:offer',
  SCREEN_ANSWER: 'screen:answer',
  SCREEN_ICE_CANDIDATE: 'screen:ice_candidate',

  // Invites & Notifications
  INVITE_RECEIVED: 'invite:received',
  INVITE_RESPONSE: 'invite:response'
};

export const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.relay.metered.ca:80' }
];
