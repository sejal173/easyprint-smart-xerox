import Redis from 'ioredis';
import { Queue } from 'bullmq';

let redisClient = null;
const shopQueues = new Map();

/**
 * Returns shared ioredis client.
 */
export function getRedisClient() {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    });

    redisClient.on('connect', () => {
      console.log(`[Redis] Connected to ${redisUrl}`);
    });

    redisClient.on('error', (err) => {
      console.error(`[Redis Error] ${err.message}`);
    });
  }

  return redisClient;
}

/**
 * Returns or creates a BullMQ Queue instance for a specific shop.
 * FIFO queue with prefix "print-queue" producing "print-queue:<shopId>" keys.
 *
 * @param {string} shopId
 * @returns {Queue}
 */
export function getShopQueue(shopId) {
  const cleanId = String(shopId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!shopQueues.has(cleanId)) {
    const client = getRedisClient();
    const queue = new Queue(cleanId, {
      prefix: 'print-queue',
      connection: client,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
    shopQueues.set(cleanId, queue);
  }

  return shopQueues.get(cleanId);
}

/**
 * Gracefully closes Redis client and all open BullMQ queues.
 */
export async function closeRedis() {
  for (const queue of shopQueues.values()) {
    try {
      await queue.close();
    } catch {
      // ignore
    }
  }
  shopQueues.clear();

  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      // ignore
    }
    redisClient = null;
  }
}
