import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

import { connectDB } from './config/db.js';
import { getRedisClient } from './config/redis.js';
import { initStorage, TEMP_UPLOAD_DIR } from './config/storage.js';

import authRoutes from './routes/authRoutes.js';
import ownerShopRoutes from './routes/ownerShopRoutes.js';
import shopRoutes from './routes/shopRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import pricingRoutes from './routes/pricingRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import devRoutes from './routes/devRoutes.js';
import { sweepExpiredLeases } from './controllers/agentController.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Socket.IO configuration
export const io = new SocketIOServer(server, {
  cors: {
    origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  },
});

app.set('io', io);

// Socket.IO Room Joining with Zod Validation
const joinShopSchema = z.string().trim().min(1, 'Valid shop ID is required');
const joinOrderSchema = z.string().trim().min(1, 'Valid order number is required');

// Socket.IO Agent Handshake Authentication
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (token) {
      const crypto = await import('crypto');
      const tokenHash = crypto.default.createHash('sha256').update(token).digest('hex');
      const { AgentDevice } = await import('./models/AgentDevice.js');
      const agent = await AgentDevice.findOne({ tokenHash, isRevoked: false });
      if (agent) {
        socket.agent = agent;
        socket.join(`agent:${agent._id}`);
        socket.join(`shop:${agent.shop}`);
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

io.on('connection', (socket) => {
  // Support both join:shop and join.shop
  const handleJoinShop = (shopId) => {
    const parse = joinShopSchema.safeParse(shopId);
    if (parse.success) {
      socket.join(`shop:${parse.data}`);
    }
  };

  const handleJoinOrder = (orderNumber) => {
    const parse = joinOrderSchema.safeParse(orderNumber);
    if (parse.success) {
      socket.join(`order:${parse.data}`);
    }
  };

  socket.on('join:shop', handleJoinShop);
  socket.on('join.shop', handleJoinShop);

  socket.on('join:order', handleJoinOrder);
  socket.on('join.order', handleJoinOrder);
});

// Security & Parsing Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin: [CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);

app.use(cookieParser());

// Webhook raw body parser MUST be mounted BEFORE express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded files statically for previews
app.use('/uploads/temp', express.static(TEMP_UPLOAD_DIR));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'EasyPrint Smart Xerox API',
    phase: '3A',
    time: new Date().toISOString(),
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/owner/shops', ownerShopRoutes);
app.use('/api/shops', shopRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/agent', agentRoutes);

// Dev endpoint: mounted only when not in production
if (process.env.NODE_ENV !== 'production') {
  console.warn('[SECURITY WARNING] Dev routes enabled (/api/dev/*). Do not enable in production.');
  app.use('/api/dev', devRoutes);
}

// Global Error Handler
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    await initStorage();
    await connectDB();
    getRedisClient();

    server.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(` EasyPrint Backend API running on port ${PORT}`);
      console.log(` Health check: http://localhost:${PORT}/api/health`);
      console.log(` Phase 3A: Razorpay Payments & Agent API Ready`);
      console.log(`===============================================`);
    });

    // Run lease sweep on startup and every 60s
    sweepExpiredLeases(io).catch(() => {});
    setInterval(() => {
      sweepExpiredLeases(io).catch((err) => {
        console.error('[Lease Sweeper Error]:', err.message);
      });
    }, 60000);
  } catch (err) {
    console.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

// Only start automatically when server.js is the entry point
if (process.argv[1] && (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server'))) {
  startServer();
}

export { app, server };
