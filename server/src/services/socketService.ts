import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'xhat_super_secret_jwt_key_13579';

let io: Server | null = null;
const onlineUsers = new Map<string, string>(); // Maps socket.id -> userId
const userSockets = new Map<string, Set<string>>(); // Maps userId -> Set of socket.ids (supports multiple tabs)

export const initSocket = (server: HttpServer): Server => {
  io = new Server(server, {
    cors: {
      origin: '*', // Allow all origins in dev, configure as needed
      methods: ['GET', 'POST'],
    },
  });

  // Socket Auth Middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', decoded.id)
        .single();

      if (error || !user) {
        return next(new Error('Authentication error: User not found'));
      }

      // Attach user ID to socket
      (socket as any).userId = user.id;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = (socket as any).userId;
    console.log(`User connected: ${userId} (Socket ID: ${socket.id})`);

    // Track active connection
    onlineUsers.set(socket.id, userId);
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // Join personal room named after userId
    socket.join(userId);

    // Update user status in database to online
    try {
      await supabase
        .from('users')
        .update({ status: 'online', last_seen: new Date().toISOString() })
        .eq('id', userId);
      
      // Update message delivery status: Set all messages addressed to this user as delivered
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .contains('participants', [userId]);

      const convIds = (conversations || []).map((c: any) => c.id);

      if (convIds.length > 0) {
        const { data: undeliveredMessages } = await supabase
          .from('messages')
          .select('*')
          .in('conversation_id', convIds)
          .neq('sender_id', userId);

        const messagesToUpdate = (undeliveredMessages || []).filter((m: any) =>
          !(m.delivered_to || []).includes(userId)
        );

        if (messagesToUpdate.length > 0) {
          for (const msg of messagesToUpdate) {
            const deliveredTo = Array.from(new Set([...(msg.delivered_to || []), userId]));
            await supabase
              .from('messages')
              .update({ delivered_to: deliveredTo })
              .eq('id', msg.id);

            // Notify senders that messages were delivered
            emitToUser(msg.sender_id, 'message_delivered', {
              messageId: msg.id,
              deliveredTo: userId,
              conversationId: msg.conversation_id
            });
          }
        }
      }

      // Broadcast presence update
      socket.broadcast.emit('user_status_changed', { userId, status: 'online' });
    } catch (err) {
      console.error('Error updating status on connect:', err);
    }

    // Typing Indicators
    socket.on('typing', (data: { conversationId: string; recipientId: string }) => {
      if (data.recipientId) {
        io?.to(data.recipientId).emit('user_typing', {
          conversationId: data.conversationId,
          userId,
        });
      }
    });

    socket.on('stop_typing', (data: { conversationId: string; recipientId: string }) => {
      if (data.recipientId) {
        io?.to(data.recipientId).emit('user_stop_typing', {
          conversationId: data.conversationId,
          userId,
        });
      }
    });

    // Handle Disconnect
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId} (Socket ID: ${socket.id})`);
      
      onlineUsers.delete(socket.id);
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          
          // User is fully offline (no other sessions)
          try {
            const lastSeenDate = new Date();
            await supabase
              .from('users')
              .update({ status: 'offline', last_seen: lastSeenDate.toISOString() })
              .eq('id', userId);
            
            // Broadcast offline presence
            socket.broadcast.emit('user_status_changed', {
              userId,
              status: 'offline',
              lastSeen: lastSeenDate.toISOString(),
            });
          } catch (err) {
            console.error('Error updating offline status:', err);
          }
        }
      }
    });
  });

  return io;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error('Socket.IO is not initialized!');
  }
  return io;
};

// Emits an event to all active sockets of a specific user
export const emitToUser = (userId: string, event: string, payload: any): void => {
  if (io) {
    io.to(userId).emit(event, payload);
  }
};

// Returns whether a user has at least one active socket session
export const isUserOnline = (userId: string): boolean => {
  const sockets = userSockets.get(userId);
  return sockets != null && sockets.size > 0;
};
