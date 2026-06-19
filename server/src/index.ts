import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { connectDB, closeDB } from './config/db';
import { initSocket } from './services/socketService';
import { errorHandler } from './middlewares/error';
import { apiLimiter } from './middlewares/rateLimiter';

// Import Routes
import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import chatRoutes from './routes/chatRoutes';
import messageRoutes from './routes/messageRoutes';
import uploadRoutes from './routes/uploadRoutes';

// Load Environment Configuration
const PORT = process.env.PORT || 5000;
const app = express();
const httpServer = createServer(app);

// Initialize database
connectDB();

// Middlewares
app.use(cors({
  origin: '*', // Customize this for production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Configure helmet (allowing cross-origin resource requests for images/media uploads)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve file uploads directory as static
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Apply general API rate limiter
app.use('/api', apiLimiter);

// API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);

// Base Route
app.get('/', (req, res) => {
  res.json({ status: 'healthy', service: 'Altma Chat Backend API' });
});

// Error handling middleware (must be registered last)
app.use(errorHandler);

// Initialize Socket.IO
initSocket(httpServer);

// Start HTTP Server
const server = httpServer.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Altma Chat Server is running in dev mode on port ${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}`);
  console.log(`===============================================`);
});

// Graceful shutdown handling
const shutdown = async () => {
  console.log('Shutting down server gracefully...');
  server.close(async () => {
    await closeDB();
    console.log('Server process terminated.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
