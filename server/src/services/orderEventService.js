import { OrderEvent } from '../models/index.js';

/**
 * Records an immutable lifecycle event for an order.
 *
 * @param {string|mongoose.Types.ObjectId} orderId
 * @param {string} orderNumber
 * @param {string} type - Event identifier (e.g. 'status_draft', 'status_queued', 'status_completed')
 * @param {object} [data={}] - Optional event payload / metadata
 * @returns {Promise<OrderEvent|undefined>}
 */
export async function recordOrderEvent(orderId, orderNumber, type, data = {}) {
  try {
    return await OrderEvent.create({
      order: orderId,
      orderNumber,
      type,
      data,
    });
  } catch (err) {
    console.error(`[OrderEvent] Failed to record event ${type} for order ${orderNumber}:`, err.message);
  }
}

export default recordOrderEvent;

