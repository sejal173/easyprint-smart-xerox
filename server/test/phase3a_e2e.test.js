process.env.NODE_ENV = 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_mock_key_id';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_mock_secret_key_987';
process.env.RAZORPAY_WEBHOOK_SECRET = 'rzp_test_webhook_secret_456';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import crypto from 'crypto';
import { io as ClientIO } from 'socket.io-client';

import { app, io as serverIo } from '../src/server.js';
import { connectDB } from '../src/config/db.js';
import { getRedisClient, closeRedis } from '../src/config/redis.js';
import { initStorage, saveFile } from '../src/config/storage.js';
import { setMockRazorpayClient } from '../src/config/razorpay.js';
import {
  User,
  Shop,
  Order,
  OrderFile,
  PrintJob,
  AgentDevice,
  Payment,
  WebhookEvent,
} from '../src/models/index.js';
import { sweepExpiredLeases } from '../src/controllers/agentController.js';

let server;
let baseUrl;
let ownerCookie;
let testShop;
let mockRazorpay;

test.before(async () => {
  await initStorage();
  await connectDB();
  getRedisClient();

  // Mock Razorpay SDK methods
  mockRazorpay = {
    orders: {
      create: async (params) => ({
        id: `order_rzp_${Date.now()}`,
        amount: params.amount,
        currency: params.currency || 'INR',
        receipt: params.receipt,
        status: 'created',
      }),
    },
    payments: {
      refund: async (paymentId, params) => ({
        id: `rfnd_rzp_${Date.now()}`,
        payment_id: paymentId,
        amount: params.amount,
        status: 'processed',
      }),
    },
  };
  setMockRazorpayClient(mockRazorpay);

  // Clean test data
  await Order.deleteMany({ orderNumber: /^TEST-/ });
  await PrintJob.deleteMany({});
  await AgentDevice.deleteMany({});
  await WebhookEvent.deleteMany({ eventId: /^evt_test_/ });

  // Start test server
  await new Promise((resolve) => {
    server = http.createServer(app);
    serverIo.attach(server);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Authenticate as owner to get auth cookie
  const jwtSecret = process.env.JWT_SECRET || 'easyprint_super_secret_jwt_key_2026';
  const owner = await User.findOne({ email: 'owner@easyprint.test' });
  const jwt = (await import('jsonwebtoken')).default;
  const token = jwt.sign({ id: owner._id, role: 'owner' }, jwtSecret, { expiresIn: '7d' });
  ownerCookie = `token=${token}`;

  testShop = await Shop.findOne({ slug: 'quickcopy-central' });
  if (testShop && owner) {
    testShop.owner = owner._id;
    await testShop.save();
  }
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeRedis();
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
});

test('1. Deterministic queue sorting: ties in paidAt are sorted by queueNumber asc', async () => {
  const samePaidAt = new Date('2026-11-06T12:00:00Z');

  // Create 3 orders with the exact same paidAt, but different queueNumbers
  const orderA = await Order.create({
    orderNumber: 'TEST-P3-SORT-A',
    shop: testShop._id,
    status: 'queued',
    totalAmount: 10,
    paidAt: samePaidAt,
    queueNumber: 30,
    options: { copies: 1, colorMode: 'bw' },
  });

  const orderB = await Order.create({
    orderNumber: 'TEST-P3-SORT-B',
    shop: testShop._id,
    status: 'queued',
    totalAmount: 10,
    paidAt: samePaidAt,
    queueNumber: 10,
    options: { copies: 1, colorMode: 'bw' },
  });

  const orderC = await Order.create({
    orderNumber: 'TEST-P3-SORT-C',
    shop: testShop._id,
    status: 'queued',
    totalAmount: 10,
    paidAt: samePaidAt,
    queueNumber: 20,
    options: { copies: 1, colorMode: 'bw' },
  });

  const res = await fetch(`${baseUrl}/api/owner/shops/${testShop._id}/queue`, {
    headers: { Cookie: ownerCookie },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);

  // Filter our test orders from the returned queue
  const testOrders = data.orders.filter((o) => o.orderNumber.startsWith('TEST-P3-SORT-'));
  assert.equal(testOrders.length, 3);

  // Must be sorted strictly by queueNumber asc: B (10), C (20), A (30)
  assert.equal(testOrders[0].orderNumber, 'TEST-P3-SORT-B');
  assert.equal(testOrders[1].orderNumber, 'TEST-P3-SORT-C');
  assert.equal(testOrders[2].orderNumber, 'TEST-P3-SORT-A');

  // Clean up
  await Order.deleteMany({ _id: { $in: [orderA._id, orderB._id, orderC._id] } });
});

let testOrderNumber;
let testRazorpayOrderId;
let testAmountPaise;

test('2. Razorpay payment creation: computes total server-side and sets pending_payment', async () => {
  // Create a draft order
  const storageKey = `doc_test_${Date.now()}.pdf`;
  await saveFile(storageKey, Buffer.from('%PDF-1.4 test document content'));

  const draftOrder = await Order.create({
    orderNumber: 'TEST-P3-PAY-01',
    shop: testShop._id,
    customerPhone: '+919999900001',
    status: 'draft',
    totalAmount: 50.0, // Client claimed amount
    options: {
      pageSelection: 'all',
      colorMode: 'bw', // 2.00 per page
      sides: 'single',
      paperSize: 'A4',
      copies: 2,
    },
  });

  await OrderFile.create({
    order: draftOrder._id,
    storageKey,
    originalName: 'test.pdf',
    mimeType: 'application/pdf',
    pageCount: 5, // 5 pages * ₹2 = ₹10 * 2 copies = ₹20 total (recomputed!)
    sizeBytes: 1024,
  });

  const res = await fetch(`${baseUrl}/api/payments/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber: 'TEST-P3-PAY-01' }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.orderNumber, 'TEST-P3-PAY-01');
  assert.equal(data.currency, 'INR');
  // Recomputed: 5 pages * ₹2 * 2 copies = ₹20.00 = 2000 paise
  assert.equal(data.amount, 2000);
  assert.ok(data.razorpayOrderId);

  testOrderNumber = data.orderNumber;
  testRazorpayOrderId = data.razorpayOrderId;
  testAmountPaise = data.amount;

  // Verify in MongoDB
  const updatedOrder = await Order.findOne({ orderNumber: 'TEST-P3-PAY-01' });
  assert.equal(updatedOrder.status, 'pending_payment');
  assert.equal(updatedOrder.razorpayOrderId, testRazorpayOrderId);
  assert.equal(updatedOrder.totalAmount, 20.0);

  const paymentRecord = await Payment.findOne({ razorpayOrderId: testRazorpayOrderId });
  assert.ok(paymentRecord);
  assert.equal(paymentRecord.status, 'created');
  assert.equal(paymentRecord.amount, 2000);
});

let testRazorpayPaymentId;

test('3. Razorpay payment verification: marks order paid, enqueues BullMQ, creates PrintJob', async () => {
  testRazorpayPaymentId = `pay_rzp_${Date.now()}`;
  const payload = `${testRazorpayOrderId}|${testRazorpayPaymentId}`;
  const validSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest('hex');

  // Test with invalid signature first
  const invalidRes = await fetch(`${baseUrl}/api/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: testRazorpayOrderId,
      razorpay_payment_id: testRazorpayPaymentId,
      razorpay_signature: 'invalid_fraudulent_signature',
    }),
  });
  assert.equal(invalidRes.status, 400);

  // Test with valid signature
  const validRes = await fetch(`${baseUrl}/api/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      razorpay_order_id: testRazorpayOrderId,
      razorpay_payment_id: testRazorpayPaymentId,
      razorpay_signature: validSignature,
    }),
  });

  assert.equal(validRes.status, 200);
  const data = await validRes.json();
  assert.equal(data.success, true);
  assert.equal(data.order.status, 'queued');
  assert.ok(data.order.queueNumber > 0);

  // Verify Order in DB
  const paidOrder = await Order.findOne({ orderNumber: testOrderNumber });
  assert.equal(paidOrder.status, 'queued');
  assert.equal(paidOrder.razorpayPaymentId, testRazorpayPaymentId);
  assert.ok(paidOrder.paidAt);

  // Verify PrintJob is created in DB
  const printJob = await PrintJob.findOne({ order: paidOrder._id });
  assert.ok(printJob);
  assert.equal(printJob.status, 'queued');
  assert.equal(printJob.attemptCount, 0);

  // Verify Payment status is updated
  const payment = await Payment.findOne({ razorpayOrderId: testRazorpayOrderId });
  assert.equal(payment.status, 'paid');
  assert.equal(payment.razorpayPaymentId, testRazorpayPaymentId);
});

test('4. Webhook idempotency: duplicate event ID is ignored cleanly', async () => {
  const eventId = `evt_test_idempotent_${Date.now()}`;
  const webhookBody = JSON.stringify({
    entity: 'event',
    account_id: 'acc_test',
    event: 'payment.captured',
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          id: `pay_hook_${Date.now()}`,
          order_id: testRazorpayOrderId,
          amount: testAmountPaise,
          status: 'captured',
        },
      },
    },
  });

  const signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(Buffer.from(webhookBody))
    .digest('hex');

  // First webhook delivery
  const res1 = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': eventId,
    },
    body: webhookBody,
  });
  assert.equal(res1.status, 200);

  // Second duplicate webhook delivery
  const res2 = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': eventId,
    },
    body: webhookBody,
  });
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.message, 'Event already processed');
});

test('5. Webhook signature validation: invalid signature rejected with 400', async () => {
  const fakeBody = JSON.stringify({ event: 'payment.failed' });
  const res = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': 'bad_tampered_signature_123',
      'x-razorpay-event-id': `evt_test_bad_${Date.now()}`,
    },
    body: fakeBody,
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.message, /invalid webhook signature/i);
});

let agentPlaintextToken;
let agentDeviceId;

test('6. Agent token pairing: returns 32-byte plaintext once and stores SHA-256 hash', async () => {
  const res = await fetch(`${baseUrl}/api/owner/shops/${testShop._id}/agent-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: ownerCookie,
    },
    body: JSON.stringify({ name: 'Central HP LaserJet Agent' }),
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.token);
  assert.equal(data.token.length, 64); // 32 bytes in hex = 64 characters

  agentPlaintextToken = data.token;
  agentDeviceId = data.agentDevice.id;

  // Verify in MongoDB: hash is stored, plaintext is NOT stored
  const expectedHash = crypto.createHash('sha256').update(agentPlaintextToken).digest('hex');
  const dbDevice = await AgentDevice.findById(agentDeviceId);
  assert.ok(dbDevice);
  assert.equal(dbDevice.tokenHash, expectedHash);
  assert.notEqual(dbDevice.tokenHash, agentPlaintextToken);
});

test('7. Agent heartbeat: updates agent device and emits agent.status over Socket.IO', async () => {
  // Connect a socket client to shop room
  const clientSocket = ClientIO(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
  });

  await new Promise((resolve) => clientSocket.on('connect', resolve));
  clientSocket.emit('join:shop', testShop._id.toString());
  await new Promise((r) => setTimeout(r, 100));

  const receivedStatusPromise = new Promise((resolve) => {
    clientSocket.on('agent.status', (payload) => {
      resolve(payload);
    });
  });

  const res = await fetch(`${baseUrl}/api/agent/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agentPlaintextToken}`,
    },
    body: JSON.stringify({
      printerStatus: 'ready',
      agentVersion: '2.1.0',
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);

  const socketPayload = await receivedStatusPromise;
  assert.equal(socketPayload.printerStatus, 'ready');
  assert.equal(socketPayload.agentVersion, '2.1.0');

  clientSocket.disconnect();
});

let claimedJobId;

test('8. Atomic job claim (GET /api/agent/jobs/next): claims job with 5-min lease', async () => {
  // First call: claims the queued PrintJob from Test 3
  const res = await fetch(`${baseUrl}/api/agent/jobs/next`, {
    headers: {
      Authorization: `Bearer ${agentPlaintextToken}`,
    },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.job.id);
  assert.equal(data.job.status, 'claimed');
  assert.equal(data.job.attemptCount, 1);
  assert.ok(data.job.files[0].downloadUrl);

  // Check 5-minute lease duration (approx 300 seconds from now)
  const leaseExpiresAt = new Date(data.job.leaseExpiresAt).getTime();
  const diffSecs = (leaseExpiresAt - Date.now()) / 1000;
  assert.ok(diffSecs > 280 && diffSecs <= 305);

  claimedJobId = data.job.id;

  // Second immediate call: should return 204 No Content (concurrency 1, no more queued jobs)
  const emptyRes = await fetch(`${baseUrl}/api/agent/jobs/next`, {
    headers: {
      Authorization: `Bearer ${agentPlaintextToken}`,
    },
  });
  assert.equal(emptyRes.status, 204);
});

test('9. Job lifecycle and completion: printing -> completed, idempotency on idempotencyKey', async () => {
  // 1. Transition: claimed -> printing
  const printRes = await fetch(`${baseUrl}/api/agent/jobs/${claimedJobId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agentPlaintextToken}`,
    },
    body: JSON.stringify({
      status: 'printing',
      spoolerJobId: 1052,
    }),
  });
  assert.equal(printRes.status, 200);

  const printingOrder = await Order.findOne({ orderNumber: testOrderNumber });
  assert.equal(printingOrder.status, 'printing');
  assert.ok(printingOrder.printingStartedAt);

  // 2. Transition: printing -> completed with idempotencyKey
  const compRes1 = await fetch(`${baseUrl}/api/agent/jobs/${claimedJobId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agentPlaintextToken}`,
    },
    body: JSON.stringify({
      status: 'completed',
      idempotencyKey: 'idem_complete_test_001',
    }),
  });
  assert.equal(compRes1.status, 200);

  // 3. Repeat identical completion request with same idempotencyKey
  const compRes2 = await fetch(`${baseUrl}/api/agent/jobs/${claimedJobId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agentPlaintextToken}`,
    },
    body: JSON.stringify({
      status: 'completed',
      idempotencyKey: 'idem_complete_test_001',
    }),
  });
  assert.equal(compRes2.status, 200);
  const data2 = await compRes2.json();
  assert.equal(data2.message, 'Already processed');

  // Verify Order completed stats
  const completedOrder = await Order.findOne({ orderNumber: testOrderNumber });
  assert.equal(completedOrder.status, 'completed');
  assert.ok(completedOrder.sheetCount > 0);
  assert.ok(completedOrder.printDurationSeconds >= 0);
  assert.ok(completedOrder.completedAt);
});

test('10. Lease expiration sweep: resets status to queued, fails after 3 attempts', async () => {
  // Case A: Expired job with attemptCount = 1 -> reset to queued
  const orderA = await Order.create({
    orderNumber: 'TEST-P3-LEASE-A',
    shop: testShop._id,
    status: 'queued',
    totalAmount: 10,
    options: { copies: 1 },
  });

  const jobA = await PrintJob.create({
    order: orderA._id,
    shop: testShop._id,
    status: 'claimed',
    attemptCount: 1,
    leaseExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
  });

  await sweepExpiredLeases(serverIo);

  const refreshedA = await PrintJob.findById(jobA._id);
  assert.equal(refreshedA.status, 'queued');
  assert.equal(refreshedA.leaseExpiresAt, null);

  // Case B: Expired job with attemptCount = 3 -> marks failed
  refreshedA.status = 'claimed';
  refreshedA.attemptCount = 3;
  refreshedA.leaseExpiresAt = new Date(Date.now() - 5000);
  await refreshedA.save();

  await sweepExpiredLeases(serverIo);

  const failedJob = await PrintJob.findById(jobA._id);
  assert.equal(failedJob.status, 'failed');
  assert.match(failedJob.errorMessage, /3 attempts/i);

  const failedOrder = await Order.findById(orderA._id);
  assert.equal(failedOrder.status, 'failed');

  // Clean up
  await Order.findByIdAndDelete(orderA._id);
  await PrintJob.findByIdAndDelete(jobA._id);
});

test('11. Owner cancellation and refund: 409 if printing, cancels & refunds if queued', async () => {
  // Case A: Reject cancellation if order is currently printing
  const printingOrder = await Order.create({
    orderNumber: 'TEST-P3-CANCEL-PRINT',
    shop: testShop._id,
    status: 'printing',
    totalAmount: 20,
    options: { copies: 1 },
  });

  const printRes = await fetch(
    `${baseUrl}/api/owner/shops/${testShop._id}/orders/${printingOrder.orderNumber}/cancel`,
    {
      method: 'POST',
      headers: { Cookie: ownerCookie },
    }
  );
  assert.equal(printRes.status, 409);

  // Case B: Cancel a queued paid order -> cancels BullMQ, refunds via Razorpay
  const queuedOrder = await Order.create({
    orderNumber: 'TEST-P3-CANCEL-QUEUED',
    shop: testShop._id,
    status: 'queued',
    totalAmount: 30,
    paidAt: new Date(),
    razorpayOrderId: `order_cancel_${Date.now()}`,
    razorpayPaymentId: `pay_cancel_${Date.now()}`,
    options: { copies: 1 },
  });

  await Payment.create({
    order: queuedOrder._id,
    razorpayOrderId: queuedOrder.razorpayOrderId,
    razorpayPaymentId: queuedOrder.razorpayPaymentId,
    amount: 3000,
    status: 'paid',
  });

  await PrintJob.create({
    order: queuedOrder._id,
    shop: testShop._id,
    status: 'queued',
  });

  const cancelRes = await fetch(
    `${baseUrl}/api/owner/shops/${testShop._id}/orders/${queuedOrder.orderNumber}/cancel`,
    {
      method: 'POST',
      headers: { Cookie: ownerCookie },
    }
  );

  assert.equal(cancelRes.status, 200);
  const cancelData = await cancelRes.json();
  assert.equal(cancelData.success, true);
  assert.equal(cancelData.order.status, 'refunded');
  assert.ok(cancelData.order.refundId);

  // Verify in MongoDB
  const refundedOrder = await Order.findById(queuedOrder._id);
  assert.equal(refundedOrder.status, 'refunded');

  const refundedJob = await PrintJob.findOne({ order: queuedOrder._id });
  assert.equal(refundedJob.status, 'failed');
  assert.match(refundedJob.errorMessage, /cancelled/i);

  // Clean up
  await Order.deleteMany({ _id: { $in: [printingOrder._id, queuedOrder._id] } });
});
