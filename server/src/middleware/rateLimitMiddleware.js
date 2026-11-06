import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../config/redis.js';

/**
 * Creates a Redis-backed rate limiter using rate-limit-redis and ioredis.
 */
function createLimiter({ windowMs, max, message, prefix }) {
  let store;
  try {
    const redis = getRedisClient();
    store = new RedisStore({
      // ioredis sendCommand wrapper
      sendCommand: (...args) => redis.call(...args),
      prefix: `rl:${prefix}:`,
    });
  } catch (err) {
    console.warn(`[RateLimit] Redis not ready for ${prefix}, falling back to memory store`);
  }

  return rateLimit({
    windowMs,
    max: process.env.NODE_ENV === 'test' ? 1000 : max,
    message: {
      success: false,
      message,
    },
    standardHeaders: true,
    legacyHeaders: false,
    store,
  });
}

// 1. Auth Rate Limiter (login, register): 10 requests per 15 minutes
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
  prefix: 'auth',
});

// 2. Payment Rate Limiter: 30 requests per 15 minutes
export const paymentLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many payment requests. Please try again after 15 minutes.',
  prefix: 'pay',
});

// 3. Upload Rate Limiter: 50 uploads per 15 minutes
export const uploadLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Upload rate limit exceeded. Please try again after 15 minutes.',
  prefix: 'upload',
});

export default { authLimiter, paymentLimiter, uploadLimiter };

