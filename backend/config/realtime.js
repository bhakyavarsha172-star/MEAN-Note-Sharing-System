const jwt = require('jsonwebtoken');

let ioInstance = null;

function initRealtime(io) {
  ioInstance = io;

  // Authenticate every socket connection with the same JWT used for the REST API
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token provided'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    // Personal room: used to push "your note list changed" events to every
    // tab/device this user has open.
    socket.join(`user:${socket.userId}`);

    // --- Live collaborative editing on a single note ---
    socket.on('note:join', (noteId) => {
      socket.join(`note:${noteId}`);
      socket.to(`note:${noteId}`).emit('note:presence', { userId: socket.userId, event: 'joined' });
    });

    socket.on('note:leave', (noteId) => {
      socket.leave(`note:${noteId}`);
      socket.to(`note:${noteId}`).emit('note:presence', { userId: socket.userId, event: 'left' });
    });

    // Broadcast live edits (debounced client-side) to everyone else viewing the note
    socket.on('note:edit', ({ noteId, title, content }) => {
      socket.to(`note:${noteId}`).emit('note:edit', { noteId, title, content, fromUserId: socket.userId });
    });

    socket.on('disconnect', () => {
      // Socket.IO automatically leaves all rooms on disconnect
    });
  });
}

// Notify a set of user IDs that their note list should refresh (create/update/delete/share)
function notifyUsers(userIds, event, payload) {
  if (!ioInstance) return;
  const unique = [...new Set(userIds.map(String))];
  unique.forEach((id) => ioInstance.to(`user:${id}`).emit(event, payload));
}

// Notify everyone currently viewing a specific note (e.g. after a save, or an attachment change)
function notifyNoteRoom(noteId, event, payload) {
  if (!ioInstance) return;
  ioInstance.to(`note:${noteId}`).emit(event, payload);
}

module.exports = { initRealtime, notifyUsers, notifyNoteRoom };
