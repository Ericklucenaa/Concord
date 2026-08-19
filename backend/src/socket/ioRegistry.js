// Small singleton registry that lets REST controllers emit realtime Socket.IO
// events without introducing a circular import with socketHandler.js.
let ioInstance = null;
let sendToUserFn = null;
let getUserSocketIdsFn = null;

export function registerIO(io, sendToUser, getUserSocketIds) {
  ioInstance = io;
  sendToUserFn = sendToUser;
  getUserSocketIdsFn = getUserSocketIds;
}

export function getIO() {
  return ioInstance;
}

// Emit an event to every socket belonging to a specific user (all their tabs/devices).
export function emitToUser(userId, event, data) {
  if (sendToUserFn) {
    sendToUserFn(userId, event, data);
  }
}

// Emit an event to every member currently connected to a server room.
export function emitToServer(serverId, event, data) {
  if (ioInstance) {
    ioInstance.to(`server:${serverId}`).emit(event, data);
  }
}

// Force a user's currently-connected sockets to join a server room, so that
// realtime events (chat/member updates) reach them immediately after they
// join a server via invite code/link — without waiting for a page reload.
export function joinUserToServerRoom(userId, serverId) {
  if (!ioInstance || !getUserSocketIdsFn) return;
  const socketIds = getUserSocketIdsFn(userId);
  if (!socketIds) return;
  socketIds.forEach((sId) => {
    const socket = ioInstance.sockets.sockets.get(sId);
    if (socket) socket.join(`server:${serverId}`);
  });
}

// Force a user's currently-connected sockets to leave a server room (e.g. after
// leaving/being kicked from a server), so they stop receiving its live updates.
export function leaveUserFromServerRoom(userId, serverId) {
  if (!ioInstance || !getUserSocketIdsFn) return;
  const socketIds = getUserSocketIdsFn(userId);
  if (!socketIds) return;
  socketIds.forEach((sId) => {
    const socket = ioInstance.sockets.sockets.get(sId);
    if (socket) socket.leave(`server:${serverId}`);
  });
}
