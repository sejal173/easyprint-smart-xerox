import './config/env.js';
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
import adminRoutes from './routes/adminRoutes.js';
import devRoutes from './routes/devRoutes.js';
import { seedAdminUser } from './utils/seedAdmin.js';
import { authLimiter, paymentLimiter, uploadLimiter } from './middleware/rateLimitMiddleware.js';
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

// Secrets validation for production boot
export function validateProductionSecrets() {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ALLOW_DEV_PAYMENT_SIMULATION === 'true' || process.env.ALLOW_DEV_PAYMENT_SIMULATION === true) {
      throw new Error('[Startup Fatal] Refusing to boot in production with ALLOW_DEV_PAYMENT_SIMULATION=true.');
    }

    const defaultSecrets = [
      'easyprint_super_secret_jwt_key_2026',
      'easyprint_secure_storage_secret',
      'default',
      'secret',
      'changeme',
    ];

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || defaultSecrets.includes(jwtSecret.trim())) {
      throw new Error('[Startup Fatal] Refusing to boot in production with missing or default JWT_SECRET.');
    }

    const rzpSecret = process.env.RAZORPAY_KEY_SECRET;
    if (!rzpSecret || defaultSecrets.includes(rzpSecret.trim())) {
      throw new Error('[Startup Fatal] Refusing to boot in production with missing or default RAZORPAY_KEY_SECRET.');
    }

    const rzpWebhook = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!rzpWebhook || defaultSecrets.includes(rzpWebhook.trim())) {
      throw new Error('[Startup Fatal] Refusing to boot in production with missing or default RAZORPAY_WEBHOOK_SECRET.');
    }
  }
}

// Security & Parsing Middleware with CSP allowing Razorpay and Socket.IO
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
        connectSrc: ["'self'", 'https://api.razorpay.com', 'https://lumberjack.razorpay.com', 'ws:', 'wss:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Strict CORS allowlist from CLIENT_URL (comma-separated list)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Not allowed by CORS: Origin ${origin} not permitted.`));
    },
    credentials: true,
  })
);

app.use(cookieParser());

// Webhook raw body parser MUST be mounted BEFORE express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply Redis-backed rate limiting to critical endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/payments/orders', paymentLimiter);
app.use('/api/upload', uploadLimiter);

// Serve uploaded files statically for previews
app.use('/uploads/temp', express.static(TEMP_UPLOAD_DIR));

// Health check endpoint (checks MongoDB, Redis, and Worker process heartbeat)
app.get(['/health', '/api/health'], async (req, res) => {
  let dbStatus = 'disconnected';
  let redisStatus = 'disconnected';
  let workerStatus = 'unknown';

  try {
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      dbStatus = 'connected';
    }
  } catch {}

  try {
    const redis = getRedisClient();
    const ping = await redis.ping();
    if (ping === 'PONG') {
      redisStatus = 'connected';
      const lastWorkerBeat = await redis.get('worker:heartbeat');
      if (lastWorkerBeat) {
        const ageSec = Math.round((Date.now() - Number(lastWorkerBeat)) / 1000);
        workerStatus = ageSec <= 120 ? 'healthy' : `stale (${ageSec}s ago)`;
      } else {
        workerStatus = 'not_registered';
      }
    }
  } catch (err) {
    redisStatus = 'disconnected';
  }

  const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';
  const statusCode = isHealthy ? 200 : 503;

  return res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    system: 'EasyPrint Smart Xerox API',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      redis: redisStatus,
      worker: workerStatus,
    },
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/owner/shops', ownerShopRoutes);
app.use('/api/admin', adminRoutes);
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
    validateProductionSecrets();
    await initStorage();
    await connectDB();
    getRedisClient();
    await seedAdminUser();

    server.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(` EasyPrint Backend API running on port ${PORT}`);
      console.log(` Health check: http://localhost:${PORT}/api/health`);
      console.log(` Phase 4A: Admin Panel, Analytics & Security Ready`);
      console.log(`===============================================`);
    });
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
