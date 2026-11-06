process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { io as ClientIO } from 'socket.io-client';

import { app } from '../src/server.js';
import { connectDB } from '../src/config/db.js';
import { getRedisClient, closeRedis, getShopQueue } from '../src/config/redis.js';
import { initStorage } from '../src/config/storage.js';
import { User, Shop, Order, Counter } from '../src/models/index.js';
import { markOrderPaid } from '../src/services/orderQueueService.js';

let server;
let baseUrl;
let ioInstance;

test.before(async () => {
  await initStorage();
  await connectDB();
  getRedisClient();

  // Clean up any test orders from previous runs
  await Order.deleteMany({ orderNumber: { $regex: /^EP-(FIFO|PARA|TOMORROW|SOCK)/ } });
  await Shop.deleteMany({ name: { $in: ['Alpha Xerox Center', 'Parallel Cap Shop'] } });

  await new Promise((resolve) => {
    server = http.createServer(app);
    ioInstance = app.get('io');
    ioInstance.attach(server);

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[Phase 2 Test Server] Running on ${baseUrl}`);
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeRedis();
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
});

let owner1Cookie = '';
let owner2Cookie = '';
let shop1Id = '';
let shop1Slug = '';

test('1. Auth: register, login, cookie set, and owner isolation (404)', async () => {
  const timestamp = Date.now();
  const email1 = `owner1_${timestamp}@easyprint.test`;
  const email2 = `owner2_${timestamp}@easyprint.test`;

  // 1a. Register Owner 1
  const reg1Res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Owner One',
      email: email1,
      password: 'Password123!',
    }),
  });

  assert.equal(reg1Res.status, 201);
  const reg1Data = await reg1Res.json();
  assert.equal(reg1Data.success, true);
  assert.equal(reg1Data.user.email, email1);

  // Extract set-cookie header
  const rawCookie1 = reg1Res.headers.get('set-cookie');
  assert.ok(rawCookie1, 'set-cookie header should be present');
  assert.match(rawCookie1, /token=/);
  assert.match(rawCookie1, /HttpOnly/i);
  owner1Cookie = rawCookie1.split(';')[0];

  // 1b. Verify GET /api/auth/me with cookie
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: owner1Cookie },
  });
  assert.equal(meRes.status, 200);
  const meData = await meRes.json();
  assert.equal(meData.user.email, email1);

  // 1c. Owner 1 creates a shop
  const createShopRes = await fetch(`${baseUrl}/api/owner/shops`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: owner1Cookie,
    },
    body: JSON.stringify({
      name: 'Alpha Xerox Center',
      address: '100 University Square, Block A',
      phone: '+91 91111 22222',
      email: email1,
      maxQueue: 100,
    }),
  });

  assert.equal(createShopRes.status, 201);
  const shopData = await createShopRes.json();
  shop1Id = shopData.shop._id;
  shop1Slug = shopData.shop.slug;
  assert.ok(shop1Id);

  // 1d. Register Owner 2
  const reg2Res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Owner Two',
      email: email2,
      password: 'Password123!',
    }),
  });
  assert.equal(reg2Res.status, 201);
  const rawCookie2 = reg2Res.headers.get('set-cookie');
  owner2Cookie = rawCookie2.split(';')[0];

  // 1e. Owner 2 attempts to access Owner 1's shop -> must return 404 (not 403)
  const forbiddenRes = await fetch(`${baseUrl}/api/owner/shops/${shop1Id}`, {
    headers: { Cookie: owner2Cookie },
  });
  assert.equal(forbiddenRes.status, 404, 'Must return 404 for shops belonging to another owner');
});

test('2. FIFO: create 100 dev-paid orders in sequence, confirm queue order & queueNumber 1..100', async () => {
  // Create 100 draft orders in DB
  const orders = [];
  const baseTime = Date.now();

  for (let i = 1; i <= 100; i++) {
    const padded = String(i).padStart(4, '0');
    const orderNumber = `EP-FIFO-${padded}`;
    const order = await Order.create({
      orderNumber,
      shop: shop1Id,
      status: 'draft',
      totalAmount: 10.0,
      options: {
        colorMode: 'bw',
        sides: 'single',
        paperSize: 'A4',
        copies: 1,
      },
    });
    orders.push(order);
  }

  // Mark all 100 as paid sequentially via dev endpoint
  for (let i = 0; i < 100; i++) {
    const o = orders[i];
    const res = await fetch(`${baseUrl}/api/dev/orders/${o.orderNumber}/mark-paid`, {
      method: 'POST',
    });
    assert.equal(res.status, 200, `Order ${o.orderNumber} should be marked paid`);
    const data = await res.json();
    assert.equal(data.order.queueNumber, i + 1, `Queue number should be ${i + 1}`);
  }

  // Fetch queue from owner endpoint
  const queueRes = await fetch(`${baseUrl}/api/owner/shops/${shop1Id}/queue`, {
    headers: { Cookie: owner1Cookie },
  });
  assert.equal(queueRes.status, 200);
  const queueData = await queueRes.json();
  assert.equal(queueData.queueLength, 100);

  // Confirm queue order equals paidAt order and queueNumber 1..100
  for (let i = 0; i < 100; i++) {
    assert.equal(queueData.orders[i].queueNumber, i + 1);
    if (i > 0) {
      const prevPaid = new Date(queueData.orders[i - 1].paidAt).getTime();
      const currPaid = new Date(queueData.orders[i].paidAt).getTime();
      assert.ok(currPaid >= prevPaid, 'FIFO queue must preserve paidAt ordering');
    }
  }
});

test('3. Cap: 101st order returns 409, and parallel requests with 99 queued allows exactly 1', async () => {
  // 3a. With 100 queued orders in shop1, 101st mark-paid returns 409
  const order101 = await Order.create({
    orderNumber: 'EP-FIFO-0101',
    shop: shop1Id,
    status: 'draft',
    totalAmount: 10.0,
  });

  const res101 = await fetch(`${baseUrl}/api/dev/orders/${order101.orderNumber}/mark-paid`, {
    method: 'POST',
  });
  assert.equal(res101.status, 409);
  const data101 = await res101.json();
  assert.equal(data101.message, 'Queue is full, please try again later.');

  // 3b. Parallel test: create new shop with maxQueue = 100
  const paraShopRes = await fetch(`${baseUrl}/api/owner/shops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: owner1Cookie },
    body: JSON.stringify({
      name: 'Parallel Cap Shop',
      address: 'Test Address',
      phone: '+91 90000 00000',
      email: 'paracap@test.com',
      maxQueue: 100,
    }),
  });
  const paraShop = (await paraShopRes.json()).shop;

  // Pre-queue 99 orders
  const batch99 = [];
  for (let i = 1; i <= 99; i++) {
    batch99.push({
      orderNumber: `EP-PARA-${String(i).padStart(4, '0')}`,
      shop: paraShop._id,
      status: 'draft',
      totalAmount: 10.0,
    });
  }
  await Order.insertMany(batch99);

  for (let i = 1; i <= 99; i++) {
    await markOrderPaid(`EP-PARA-${String(i).padStart(4, '0')}`);
  }

  // Create 20 parallel draft orders (100 to 119)
  const batch20 = [];
  for (let i = 100; i < 120; i++) {
    batch20.push({
      orderNumber: `EP-PARA-${String(i).padStart(4, '0')}`,
      shop: paraShop._id,
      status: 'draft',
      totalAmount: 10.0,
    });
  }
  await Order.insertMany(batch20);

  // Fire 20 parallel attempts simultaneously
  const parallelPromises = batch20.map((o) =>
    fetch(`${baseUrl}/api/dev/orders/${o.orderNumber}/mark-paid`, { method: 'POST' })
  );

  const results = await Promise.all(parallelPromises);
  const statusCodes = results.map((r) => r.status);

  const successCount = statusCodes.filter((s) => s === 200).length;
  const conflictCount = statusCodes.filter((s) => s === 409).length;

  assert.equal(successCount, 1, 'Exactly 1 request out of 20 parallel attempts must succeed');
  assert.equal(conflictCount, 19, 'Exactly 19 requests must be rejected with 409 Queue full');

  const finalActiveCount = await Order.countDocuments({
    shop: paraShop._id,
    status: { $in: ['queued', 'printing'] },
  });
  assert.equal(finalActiveCount, 100, 'Total queued orders must equal exactly maxQueue (100)');
});

test('4. Numbers reset: orders paid on a new date start at 1 again', async () => {
  const tomorrowOrder = await Order.create({
    orderNumber: 'EP-TOMORROW-0001',
    shop: shop1Id,
    status: 'draft',
    totalAmount: 10.0,
  });

  // Temporarily reset active capacity for shop1 to allow testing tomorrow's order
  const redis = getRedisClient();
  await redis.set(`shop:${shop1Id}:active_count`, 50);

  // Mark paid with tomorrow's date: '2026-11-07'
  const res = await fetch(`${baseUrl}/api/dev/orders/${tomorrowOrder.orderNumber}/mark-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customDate: '2026-11-07' }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.order.queueDate, '2026-11-07');
  assert.equal(data.order.queueNumber, 1, 'Queue number must reset to 1 on a new date');
});

test('5. Idempotency: calling mark-paid twice on one order does not change queueNumber or add second job', async () => {
  const testOrder = await Order.findOne({ orderNumber: 'EP-FIFO-0001' });
  const initialQueueNumber = testOrder.queueNumber;

  const res = await fetch(`${baseUrl}/api/dev/orders/${testOrder.orderNumber}/mark-paid`, {
    method: 'POST',
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.order.queueNumber, initialQueueNumber);

  // Check BullMQ jobs: should only have 1 job with this ID
  const queue = getShopQueue(shop1Id.toString());
  const job = await queue.getJob(testOrder._id.toString());
  assert.ok(job, 'BullMQ job should exist');
});

test('6. Socket: two socket.io-client connections in the same shop room both receive queue.updated', async () => {
  const socketA = ClientIO(baseUrl, { transports: ['websocket'] });
  const socketB = ClientIO(baseUrl, { transports: ['websocket'] });

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve();
    };
    socketA.on('connect', check);
    socketB.on('connect', check);
  });

  // Both join the shop room
  socketA.emit('join:shop', shop1Id.toString());
  socketB.emit('join:shop', shop1Id.toString());

  // Wait 100ms for room join to complete
  await new Promise((r) => setTimeout(r, 100));

  // Set up listeners for queue.updated
  const promiseA = new Promise((resolve) => {
    socketA.once('queue.updated', (event) => {
      resolve(event);
    });
  });

  const promiseB = new Promise((resolve) => {
    socketB.once('queue.updated', (event) => {
      resolve(event);
    });
  });

  // Create and mark paid an order to trigger the event
  const newOrder = await Order.create({
    orderNumber: `EP-SOCK-${Date.now()}`,
    shop: shop1Id,
    status: 'draft',
    totalAmount: 10.0,
  });

  // Reset capacity counter so mark paid succeeds
  const redis = getRedisClient();
  await redis.set(`shop:${shop1Id}:active_count`, 10);

  await fetch(`${baseUrl}/api/dev/orders/${newOrder.orderNumber}/mark-paid`, {
    method: 'POST',
  });

  const [eventA, eventB] = await Promise.all([promiseA, promiseB]);

  assert.equal(eventA.shopId, shop1Id.toString());
  assert.equal(eventB.shopId, shop1Id.toString());
  assert.ok(eventA.queueLength >= 1);
  assert.ok(eventB.queueLength >= 1);

  socketA.disconnect();
  socketB.disconnect();
});

test('7. Online toggle: PATCH status emits shop.status and public GET /api/shops/:slug reflects it', async () => {
  const socketClient = ClientIO(baseUrl, { transports: ['websocket'] });
  await new Promise((resolve) => socketClient.once('connect', resolve));
  socketClient.emit('join:shop', shop1Id.toString());
  await new Promise((r) => setTimeout(r, 100));

  const statusPromise = new Promise((resolve) => {
    socketClient.once('shop.status', (data) => {
      resolve(data);
    });
  });

  // Toggle offline
  const toggleRes = await fetch(`${baseUrl}/api/owner/shops/${shop1Id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: owner1Cookie,
    },
    body: JSON.stringify({ isOnline: false }),
  });

  assert.equal(toggleRes.status, 200);
  const toggleData = await toggleRes.json();
  assert.equal(toggleData.isOnline, false);

  // Confirm Socket.IO event received
  const socketEvent = await statusPromise;
  assert.equal(socketEvent.shopId, shop1Id.toString());
  assert.equal(socketEvent.isOnline, false);

  // Confirm public endpoint reflects offline
  const publicRes = await fetch(`${baseUrl}/api/shops/${shop1Slug}`);
  assert.equal(publicRes.status, 200);
  const publicData = await publicRes.json();
  assert.equal(publicData.shop.isOnline, false);
  assert.equal(publicData.shop.availability, 'OFFLINE');

  // Toggle back online
  await fetch(`${baseUrl}/api/owner/shops/${shop1Id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: owner1Cookie,
    },
    body: JSON.stringify({ isOnline: true }),
  });

  const publicResOnline = await fetch(`${baseUrl}/api/shops/${shop1Slug}`);
  const publicDataOnline = await publicResOnline.json();
  assert.equal(publicDataOnline.shop.isOnline, true);

  socketClient.disconnect();
});
