import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePageRange,
  filterOddEven,
  calculateEffectivePages,
  calculatePrintPrice,
} from '../src/pricing.js';
import {
  estimateOrderDurationSeconds,
  calculateCustomerWaitTime,
  calculateRollingAverageSecondsPerSheet,
  waitSeconds,
} from '../src/eta.js';

test('parsePageRange parses commas, ranges, and handles boundaries', () => {
  assert.deepEqual(parsePageRange('1-3, 5, 7-9', 10), [1, 2, 3, 5, 7, 8, 9]);
  assert.deepEqual(parsePageRange('1-50', 5), [1, 2, 3, 4, 5]); // clamped to maxPages
  assert.deepEqual(parsePageRange('4, 2, 8, 2', 10), [2, 4, 8]); // sorted and deduplicated
});

test('filterOddEven filters odd and even correctly', () => {
  const pages = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(filterOddEven(pages, 'odd'), [1, 3, 5]);
  assert.deepEqual(filterOddEven(pages, 'even'), [2, 4, 6]);
  assert.deepEqual(filterOddEven(pages, 'all'), [1, 2, 3, 4, 5, 6]);
});

test('calculatePrintPrice calculates B&W single-sided A4 properly', () => {
  const quote = calculatePrintPrice({
    files: [{ pageCount: 10 }],
    options: {
      colorMode: 'bw',
      sides: 'single',
      paperSize: 'A4',
      paperQuality: 'normal',
      copies: 1,
      pagesPerSheet: 1,
    },
    priceSettings: {
      bwPerPage: 2.0,
      colorPerPage: 10.0,
      duplexDiscount: 0.5,
      a3Multiplier: 2.0,
    },
  });

  assert.equal(quote.breakdown.effectivePages, 10);
  assert.equal(quote.breakdown.sheetsPerCopy, 10);
  assert.equal(quote.totalAmount, 20.0);
});

test('calculatePrintPrice applies duplex discount and color pricing', () => {
  const quote = calculatePrintPrice({
    files: [{ pageCount: 10 }],
    options: {
      colorMode: 'color',
      sides: 'double',
      paperSize: 'A4',
      paperQuality: 'normal',
      copies: 2,
      pagesPerSheet: 1,
    },
    priceSettings: {
      bwPerPage: 2.0,
      colorPerPage: 10.0,
      duplexDiscount: 1.0,
      a3Multiplier: 2.0,
    },
  });

  // 10 color pages = 10 * 10 = 100 base
  // 5 double-sided sheets = 5 * 1.0 = 5 duplex discount
  // 95 per copy * 2 copies = 190.00
  assert.equal(quote.breakdown.sheetsPerCopy, 5);
  assert.equal(quote.breakdown.duplexSheetsPerCopy, 5);
  assert.equal(quote.breakdown.duplexDiscountPerCopy, 5);
  assert.equal(quote.totalAmount, 190.0);
});

test('calculateCustomerWaitTime formats duration cleanly', () => {
  const res = calculateCustomerWaitTime({
    queuedOrders: [
      { effectivePages: 10, copies: 1, sides: 'single', pagesPerSheet: 1 },
      { effectivePages: 20, copies: 2, sides: 'single', pagesPerSheet: 1 },
    ],
  });

  assert.equal(res.queueLength, 2);
  assert.match(res.formatted, /min/);
});

test('ETA: no history default uses 180 seconds per order', () => {
  const avg = calculateRollingAverageSecondsPerSheet([]);
  assert.equal(avg, null);

  const duration = estimateOrderDurationSeconds({ effectivePages: 10 }, null);
  assert.equal(duration, 180);
});

test('ETA: 5-orders-ahead x 3 min example equals approx 15 min', () => {
  const res = calculateCustomerWaitTime({
    queuedOrders: [{}, {}, {}, {}, {}], // 5 orders ahead
    secondsPerSheet: null, // no history -> 180s each
  });

  assert.equal(res.queueLength, 5);
  assert.equal(res.totalWaitSeconds, 5 * 180); // 900 seconds
  assert.equal(res.formatted, 'approximately 15 min');
});

test('ETA: rolling average over 20+ completed orders uses only last 20', () => {
  const orders = [];
  // 5 older orders with ratio 10s/sheet
  for (let i = 0; i < 5; i++) {
    orders.push({ sheetCount: 10, printDurationSeconds: 100 });
  }
  // 20 newer orders with ratio 2s/sheet (duration 20s for 10 sheets)
  for (let i = 0; i < 20; i++) {
    orders.push({ sheetCount: 10, printDurationSeconds: 20 });
  }

  const avg = calculateRollingAverageSecondsPerSheet(orders);
  assert.equal(avg, 2.0); // Exactly 2.0 seconds per sheet
});

test('ETA: remaining-time calculation accounts for elapsed printing time', () => {
  const now = 100000;
  const started = now - 60000; // 60 seconds elapsed
  const printingOrder = {
    effectivePages: 10,
    copies: 1,
    pagesPerSheet: 1,
    sides: 'single',
    printingStartedAt: new Date(started).toISOString(),
  };

  // With secondsPerSheet = 4, 10 sheets * 4 + 30 = 70s total.
  // Elapsed = 60s -> Remaining = 10s
  const wait = waitSeconds({
    queuedOrders: [],
    currentlyPrintingOrder: printingOrder,
    secondsPerSheet: 4,
    now,
  });

  assert.equal(wait, 10);
});

