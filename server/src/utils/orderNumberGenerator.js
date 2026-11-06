import { Order } from '../models/Order.js';

/**
 * Formats a Date object as YYMMDD string.
 *
 * @param {Date} date
 * @returns {string} e.g. "261106"
 */
function formatDatePrefix(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Generates the next sequential unique order number for the current date.
 * Format: EP-YYMMDD-XXXX (e.g. EP-261106-0001)
 *
 * @returns {Promise<string>}
 */
export async function generateOrderNumber() {
  const datePrefix = formatDatePrefix();
  const searchPattern = new RegExp(`^EP-${datePrefix}-\\d{4}$`);

  // Find the highest existing order number for today
  const latestOrder = await Order.findOne({ orderNumber: searchPattern })
    .sort({ orderNumber: -1 })
    .select('orderNumber')
    .lean();

  let nextSequence = 1;
  if (latestOrder && latestOrder.orderNumber) {
    const parts = latestOrder.orderNumber.split('-');
    if (parts.length === 3) {
      const seq = parseInt(parts[2], 10);
      if (!isNaN(seq)) {
        nextSequence = seq + 1;
      }
    }
  }

  const paddedSeq = String(nextSequence).padStart(4, '0');
  return `EP-${datePrefix}-${paddedSeq}`;
}

