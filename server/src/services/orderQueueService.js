import { Order } from '../models/Order.js';
import { Shop } from '../models/Shop.js';
import { Counter } from '../models/Counter.js';
import { OrderFile } from '../models/OrderFile.js';
import { PrintJob } from '../models/PrintJob.js';
import { getShopQueue, getRedisClient } from '../config/redis.js';
import { calculateCustomerWaitTime, calculateRollingAverageSecondsPerSheet } from '@easyprint/shared';
import { recordOrderEvent } from './orderEventService.js';

/**
 * Returns current date in YYYY-MM-DD format.
 */
export function getShopLocalDateStr(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Atomically marks an order as paid, assigns sequential queue number,
 * enqueues to BullMQ, and emits Socket.IO events.
 *
 * @param {string} orderNumber
 * @param {import('socket.io').Server} [io]
 * @param {Object} [options]
 * @param {string} [options.customDate] - override date string (YYYY-MM-DD) for testing
 * @returns {Promise<{ order: Object, isAlreadyQueued: boolean }>}
 */
export async function markOrderPaid(orderNumber, io = null, { customDate = null } = {}) {
  const order = await Order.findOne({ orderNumber: orderNumber.toUpperCase() });
  if (!order) {
    const err = new Error(`Order "${orderNumber}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  // Idempotency: If order is already queued, printing, or completed, return cleanly
  if (['queued', 'printing', 'completed'].includes(order.status)) {
    return { order, isAlreadyQueued: true };
  }

  if (!['draft', 'pending_payment'].includes(order.status)) {
    const err = new Error(`Order "${orderNumber}" cannot be marked as paid from status "${order.status}".`);
    err.statusCode = 400;
    throw err;
  }

  const shop = await Shop.findById(order.shop);
  if (!shop) {
    const err = new Error('Associated shop not found.');
    err.statusCode = 404;
    throw err;
  }

  const maxQueue = shop.maxQueue || 100;
  const redis = getRedisClient();
  const activeCountKey = `shop:${shop._id}:active_count`;

  // Get current DB count for fallback atomic initialization
  const dbActiveCount = await Order.countDocuments({
    shop: shop._id,
    status: { $in: ['queued', 'printing'] },
  });

  // Concurrency-safe atomic reservation via Lua
  const luaScript = `
    redis.call('setnx', KEYS[1], ARGV[2])
    local active = tonumber(redis.call('get', KEYS[1]) or '0')
    local maxCap = tonumber(ARGV[1])
    if active >= maxCap then
      return -1
    else
      return redis.call('incr', KEYS[1])
    end
  `;

  const reservation = await redis.eval(luaScript, 1, activeCountKey, maxQueue, dbActiveCount);
  if (reservation === -1) {
    const err = new Error('Queue is full, please try again later.');
    err.statusCode = 409;
    throw err;
  }

  // Acquire sequential daily queue number from Counter
  const dateStr = customDate || getShopLocalDateStr();
  const counterKey = `queue:${shop._id}:${dateStr}`;

  let counter;
  try {
    counter = await Counter.findOneAndUpdate(
      { key: counterKey },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
  } catch (counterErr) {
    // Roll back redis reservation on counter failure
    await redis.decr(activeCountKey);
    throw counterErr;
  }

  const queueNumber = counter.seq;
  const paidAt = new Date();

  // Atomically update Order status to 'queued'
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: { $in: ['draft', 'pending_payment'] },
    },
    {
      $set: {
        status: 'queued',
        paidAt,
        queueNumber,
        queueDate: dateStr,
      },
    },
    { new: true }
  );

  if (!updatedOrder) {
    // If order was updated concurrently by another request
    await redis.decr(activeCountKey);
    const refreshed = await Order.findById(order._id);
    return { order: refreshed, isAlreadyQueued: true };
  }

  await recordOrderEvent(updatedOrder._id, updatedOrder.orderNumber, 'status_queued', {
    queueNumber,
    queueDate: dateStr,
    paidAt,
  });

  // Add to shop's BullMQ FIFO queue
  try {
    const bullQueue = getShopQueue(shop._id.toString());
    await bullQueue.add(
      'print',
      {
        orderId: updatedOrder._id.toString(),
        orderNumber: updatedOrder.orderNumber,
        shopId: shop._id.toString(),
      },
      {
        jobId: updatedOrder._id.toString(),
      }
    );
  } catch (queueErr) {
    console.error(`[BullMQ] Warning adding job for order ${updatedOrder.orderNumber}:`, queueErr.message);
  }

  // Create or ensure PrintJob exists for Windows printing agent
  try {
    await PrintJob.findOneAndUpdate(
      { order: updatedOrder._id },
      {
        $setOnInsert: {
          order: updatedOrder._id,
          shop: shop._id,
          status: 'queued',
          attemptCount: 0,
        },
      },
      { upsert: true, new: true }
    );
  } catch (jobErr) {
    console.error(`[PrintJob] Warning creating print job for order ${updatedOrder.orderNumber}:`, jobErr.message);
  }

  // Calculate live ETA stats for Socket.IO event emission
  if (io) {
    emitQueueAndOrderStatus(shop._id.toString(), updatedOrder, io);
    // Emit job.queued to shop room for the Windows background printing agent
    io.to(`shop:${shop._id}`).emit('job.queued', {
      shopId: shop._id.toString(),
      orderNumber: updatedOrder.orderNumber,
      queueNumber: updatedOrder.queueNumber,
      status: 'queued',
    });
  }

  return { order: updatedOrder, isAlreadyQueued: false };
}

/**
 * Calculates current queue statistics and emits Socket.IO updates to shop and order rooms.
 */
export async function emitQueueAndOrderStatus(shopId, order, io) {
  try {
    const shop = await Shop.findById(shopId);
    if (!shop) return;

    // Get active orders for ETA calculation
    const queuedOrders = await Order.find({ shop: shopId, status: 'queued' })
      .select('options breakdown paidAt queueNumber orderNumber')
      .sort({ paidAt: 1, queueNumber: 1, createdAt: 1 })
      .lean();

    const printingOrder = await Order.findOne({ shop: shopId, status: 'printing' })
      .select('options breakdown printingStartedAt orderNumber')
      .lean();

    // Completed orders for rolling average
    const completedOrders = await Order.find({ shop: shopId, status: 'completed' })
      .select('sheetCount printDurationSeconds')
      .sort({ completedAt: -1 })
      .limit(20)
      .lean();

    const rollingAvg = calculateRollingAverageSecondsPerSheet(completedOrders);

    const waitStats = calculateCustomerWaitTime({
      queuedOrders,
      currentlyPrintingOrder: printingOrder,
      secondsPerSheet: rollingAvg,
    });

    // 1. Emit queue.updated to room shop:<id>
    io.to(`shop:${shopId}`).emit('queue.updated', {
      shopId,
      queueLength: waitStats.queueLength,
      estimatedWaitSeconds: waitStats.totalWaitSeconds,
      estimatedWaitFormatted: waitStats.formatted,
    });

    // 2. If a specific order is supplied, emit order.status to room order:<orderNumber>
    if (order && order.orderNumber) {
      const ordersAheadCount = queuedOrders.filter(
        (o) => o.paidAt && order.paidAt && new Date(o.paidAt) < new Date(order.paidAt)
      ).length + (printingOrder ? 1 : 0);

      io.to(`order:${order.orderNumber}`).emit('order.status', {
        orderNumber: order.orderNumber,
        status: order.status,
        queuePosition: ordersAheadCount + 1,
        ordersAhead: ordersAheadCount,
        eta: waitStats.formatted,
        estimatedWaitSeconds: waitStats.totalWaitSeconds,
      });
    }
  } catch (err) {
    console.error('[Socket.IO Emit Error]', err.message);
  }
}
