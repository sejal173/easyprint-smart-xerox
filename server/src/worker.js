import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from './config/db.js';
import { getRedisClient, closeRedis } from './config/redis.js';
import { initStorage } from './config/storage.js';
import { sweepExpiredLeases } from './controllers/agentController.js';
import { runFileRetentionCleanup } from './services/retentionService.js';

let isRunning = true;
let sweeperInterval = null;
let retentionInterval = null;

async function startWorker() {
  console.log('===============================================');
  console.log(' EasyPrint Background Worker Process Starting');
  console.log(' Roles: Lease Sweeper, File Retention, BullMQ');
  console.log('===============================================');

  try {
    await initStorage();
    await connectDB();
    getRedisClient();

    console.log('[Worker] Connected to MongoDB and Redis successfully.');

    // 1. Run lease sweeper immediately, then every 60 seconds
    console.log('[Worker] Starting lease sweeper (every 60s)...');
    sweepExpiredLeases().catch((err) => {
      console.error('[Worker Sweeper Error]:', err.message);
    });
    sweeperInterval = setInterval(() => {
      if (!isRunning) return;
      sweepExpiredLeases().catch((err) => {
        console.error('[Worker Sweeper Error]:', err.message);
      });
    }, 60000);

    // 2. Run file retention cleanup immediately, then every 10 minutes (600,000 ms)
    console.log('[Worker] Starting file retention cleanup (every 10m)...');
    runFileRetentionCleanup().catch((err) => {
      console.error('[Worker Retention Error]:', err.message);
    });
    retentionInterval = setInterval(() => {
      if (!isRunning) return;
      runFileRetentionCleanup().catch((err) => {
        console.error('[Worker Retention Error]:', err.message);
      });
    }, 10 * 60 * 1000);

    console.log('[Worker] All background jobs scheduled and running.');
  } catch (err) {
    console.error('[Worker Startup Failed]:', err.message);
    process.exit(1);
  }
}

async function shutdown() {
  console.log('\n[Worker] Gracefully shutting down worker process...');
  isRunning = false;
  if (sweeperInterval) clearInterval(sweeperInterval);
  if (retentionInterval) clearInterval(retentionInterval);

  try {
    await closeRedis();
    console.log('[Worker] Redis connections closed.');
  } catch {}

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Auto-start when executed directly
if (process.argv[1] && (process.argv[1].endsWith('worker.js') || process.argv[1].endsWith('worker'))) {
  startWorker();
}

export { startWorker, shutdown };

