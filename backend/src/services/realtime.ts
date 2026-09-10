import { Server } from 'socket.io';
import { authenticateToken } from '../middleware/auth';
import { accessStore } from './operations';
import { prisma } from '../db';
export function configureRealtime(io: Server) {
  io.use(async (socket, next) => {
    try {
      const auth = await authenticateToken(String(socket.handshake.auth?.token || ''));
      socket.data.actor = auth.user; socket.data.expiresAt = auth.expiresAt; next();
    } catch { next(new Error('Sign in to receive store updates.')); }
  });
  io.on('connection', socket => {
    socket.join(`user-${socket.data.actor.id}`);
    const expiry = socket.data.expiresAt ? setTimeout(() => socket.disconnect(true), Math.max(0, socket.data.expiresAt - Date.now())) : null;
    expiry?.unref();
    socket.on('join_store', async (storeId, ack) => {
      try {
        const { user } = await authenticateToken(String(socket.handshake.auth.token));
        if (typeof storeId !== 'string') throw new Error('Invalid store');
        await accessStore(prisma, user, storeId);
        for (const room of socket.rooms) if (room.startsWith('store-')) await socket.leave(room);
        await socket.join(`store-${storeId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch { if (typeof ack === 'function') ack({ ok: false, error: 'Store access denied.' }); }
    });
    socket.on('leave_store', storeId => { if (typeof storeId === 'string') socket.leave(`store-${storeId}`); });
    socket.on('disconnect', () => { if (expiry) clearTimeout(expiry); });
  });
}
