import { calculatePhysicalSheets } from './pricing.js';

/**
 * Fixed setup overhead per order in seconds (loading tray, warm-up, handoff)
 */
export const FIXED_SETUP_OVERHEAD_SECONDS = 30;

/**
 * Default fallback time in seconds per order when there is no history
 */
export const DEFAULT_ORDER_TIME_SECONDS = 180; // 3 minutes

/**
 * Calculates rolling average seconds per sheet from the shop's last 20 completed orders.
 * Returns null if there is no history (orders with sheetCount > 0).
 *
 * @param {Array<{ sheetCount: number, printDurationSeconds: number }>} completedOrders
 * @returns {number|null} average seconds per sheet, or null if no valid history
 */
export function calculateRollingAverageSecondsPerSheet(completedOrders = []) {
  if (!completedOrders || completedOrders.length === 0) {
    return null;
  }

  // Filter completed orders with sheetCount > 0, take last 20
  const validOrders = completedOrders.filter(
    (o) => o && Number(o.sheetCount) > 0 && Number(o.printDurationSeconds) > 0
  );

  if (validOrders.length === 0) {
    return null;
  }

  const recent = validOrders.slice(-20);
  const totalRatios = recent.reduce(
    (sum, o) => sum + Number(o.printDurationSeconds) / Number(o.sheetCount),
    0
  );

  return totalRatios / recent.length;
}

/**
 * Calculates estimated printing time for a single order in seconds.
 * estimatedSeconds(order) = (pages × copies × perSheetFactor) × secondsPerSheet + 30 setup seconds.
 * If secondsPerSheet is null (no history), defaults to 180 seconds per order.
 *
 * @param {Object} order
 * @param {number} [order.effectivePages=1]
 * @param {number} [order.copies=1]
 * @param {number} [order.pagesPerSheet=1]
 * @param {string} [order.sides='single']
 * @param {number|null} [secondsPerSheet=null]
 * @returns {number} estimated duration in seconds
 */
export function estimatedSeconds(order = {}, secondsPerSheet = null) {
  if (secondsPerSheet === null || secondsPerSheet === undefined) {
    return DEFAULT_ORDER_TIME_SECONDS;
  }

  const effectivePages = Math.max(1, Number(order.effectivePages || order.breakdown?.effectivePages) || 1);
  const copies = Math.max(1, Number(order.copies || order.options?.copies) || 1);
  const pagesPerSheet = Number(order.pagesPerSheet || order.options?.pagesPerSheet) || 1;
  const sides = order.sides || order.options?.sides || 'single';

  const { totalSheets } = calculatePhysicalSheets({
    effectivePages,
    pagesPerSheet,
    sides,
    copies,
  });

  return Math.round(totalSheets * secondsPerSheet + FIXED_SETUP_OVERHEAD_SECONDS);
}

/**
 * Alias for estimatedSeconds for backwards compatibility
 */
export const estimateOrderDurationSeconds = estimatedSeconds;

/**
 * Calculates total waiting time for a new customer given a queue snapshot.
 * waitSeconds(queueSnapshot) = sum of estimatedSeconds for orders ahead
 *                            + remaining time of the printing order (estimated - elapsed, minimum 0).
 *
 * @param {Object} queueSnapshot
 * @param {Array<Object>} [queueSnapshot.queuedOrders=[]] - orders waiting ahead in queue
 * @param {Object|null} [queueSnapshot.currentlyPrintingOrder=null] - order currently printing
 * @param {number|null} [queueSnapshot.secondsPerSheet=null] - shop rolling average, or null if no history
 * @param {number} [queueSnapshot.now] - current timestamp in ms for testing
 * @returns {number} total wait time in seconds
 */
export function waitSeconds({
  queuedOrders = [],
  currentlyPrintingOrder = null,
  secondsPerSheet = null,
  now = Date.now(),
} = {}) {
  let totalWait = 0;

  // Remaining time of printing order
  if (currentlyPrintingOrder) {
    const totalEst = estimatedSeconds(currentlyPrintingOrder, secondsPerSheet);
    let elapsed = 0;
    if (currentlyPrintingOrder.printingStartedAt) {
      const started = new Date(currentlyPrintingOrder.printingStartedAt).getTime();
      elapsed = Math.max(0, (now - started) / 1000);
    }
    const remaining = Math.max(0, totalEst - elapsed);
    totalWait += remaining;
  }

  // Sum estimated times for all orders ahead
  for (const order of queuedOrders) {
    totalWait += estimatedSeconds(order, secondsPerSheet);
  }

  return Math.round(totalWait);
}

/**
 * Formats wait time in seconds for human display:
 * "approximately N min" (rounded to nearest minute, minimum "about 1 min").
 *
 * @param {number} totalSeconds
 * @param {number} queueLength
 * @returns {string}
 */
export function formatWaitTime(totalSeconds, queueLength = 1) {
  if (queueLength === 0 || totalSeconds <= 0) {
    return 'No wait — Ready to print';
  }

  const minutes = Math.round(totalSeconds / 60);
  if (minutes <= 1) {
    return 'about 1 min';
  }
  return `approximately ${minutes} min`;
}

/**
 * Comprehensive calculator returning wait seconds, formatted text, and queue length.
 *
 * @param {Object} params
 * @returns {{ totalWaitSeconds: number, formatted: string, queueLength: number }}
 */
export function calculateCustomerWaitTime({
  queuedOrders = [],
  currentlyPrintingOrder = null,
  secondsPerSheet = null,
  now = Date.now(),
} = {}) {
  const queueLength = (queuedOrders ? queuedOrders.length : 0) + (currentlyPrintingOrder ? 1 : 0);
  const totalWaitSecs = waitSeconds({
    queuedOrders,
    currentlyPrintingOrder,
    secondsPerSheet,
    now,
  });

  return {
    totalWaitSeconds: totalWaitSecs,
    formatted: formatWaitTime(totalWaitSecs, queueLength),
    queueLength,
  };
}
