process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { io as ClientIO } from 'socket.io-client';

import { app, io as serverIo, validateProductionSecrets } from '../src/server.js';
import { connectDB } from '../src/config/db.js';
import { getRedisClient, closeRedis } from '../src/config/redis.js';
import { initStorage, TEMP_UPLOAD_DIR } from '../src/config/storage.js';
import {
  User,
  Shop,
  Order,
  OrderFile,
  PrintJob,
  AgentDevice,
  OwnerAlert,
  AdminAction,
  OrderEvent,
} from '../src/models/index.js';
import { purgeRetainedFiles } from '../src/services/retentionService.js';

let server;
let baseUrl;
let ownerUser;
let ownerToken;
let adminUser;
let adminToken;
let testShop;
let agentToken;
let agentDevice;

test.before(async () => {
  await initStorage();
  await connectDB();
  getRedisClient();

  const jwtSecret = process.env.JWT_SECRET || 'easyprint_super_secret_jwt_key_2026';

  // 1. Create or fetch owner user
  ownerUser = await User.findOne({ email: 'owner_phase4a@easyprint.test' });
  if (!ownerUser) {
    ownerUser = await User.create({
      name: 'Phase 4A Owner',
      email: 'owner_phase4a@easyprint.test',
      passwordHash: 'dummy_hash',
      role: 'owner',
      isSuspended: false,
    });
  }
  ownerToken = jwt.sign({ id: ownerUser._id, role: 'owner' }, jwtSecret, { expiresIn: '7d' });

  // 2. Create or fetch admin user
  adminUser = await User.findOne({ email: 'admin_phase4a@easyprint.test' });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Phase 4A Super Admin',
      email: 'admin_phase4a@easyprint.test',
      passwordHash: 'dummy_hash',
      role: 'admin',
      isSuspended: false,
    });
  }
  adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, jwtSecret, { expiresIn: '7d' });

  // 3. Create test shop
  testShop = await Shop.findOne({ slug: 'phase4a-analytics-shop' });
  if (!testShop) {
    testShop = await Shop.create({
      owner: ownerUser._id,
      name: 'Phase 4A Analytics Shop',
      slug: 'phase4a-analytics-shop',
      address: '77 Test Plaza',
      phone: '+919876500000',
      email: 'p4a@easyprint.test',
      isOnline: true,
      status: 'active',
      priceSettings: {
        bwPerPage: 2,
        colorPerPage: 10,
        duplexDiscountPerSheet: 0.5,
        paperSizeMultipliers: { A4: 1, A3: 2 },
      },
    });
  } else {
    testShop.status = 'active';
    testShop.isOnline = true;
    await testShop.save();
  }

  // 4. Create agent device for this shop
  agentToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(agentToken).digest('hex');
  agentDevice = await AgentDevice.create({
    shop: testShop._id,
    name: 'Phase4A Agent PC',
    tokenHash,
    lastHeartbeatAt: new Date(),
    printerStatus: 'ready',
    isRevoked: false,
  });

  // Start HTTP server
  await new Promise((resolve) => {
    server = http.createServer(app);
    serverIo.attach(server);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await closeRedis();
  } catch {}
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
});

// TEST 1: order.completed payload carries queueNumber
test('1. order.completed payload carries queueNumber', async () => {
  const orderNum = 'EP-P4A-0001';
  await Order.deleteMany({ orderNumber: orderNum });
  await PrintJob.deleteMany({ 'order.orderNumber': orderNum });

  const order = await Order.create({
    orderNumber: orderNum,
    shop: testShop._id,
    customerPhone: '+919999900001',
    status: 'printing',
    queueNumber: 42,
    queueDate: '2026-11-06',
    totalAmount: 20,
    paidAt: new Date(),
  });

  const printJob = await PrintJob.create({
    order: order._id,
    shop: testShop._id,
    agentDevice: agentDevice._id,
    status: 'printing',
    leaseExpiresAt: new Date(Date.now() + 300000),
  });

  // Connect socket.io client to listen to order completion
  const clientSocket = ClientIO(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
  });

  await new Promise((resolve) => clientSocket.on('connect', resolve));
  clientSocket.emit('join:order', orderNum);

  const completionEventPromise = new Promise((resolve) => {
    clientSocket.on('order.completed', (data) => {
      resolve(data);
    });
  });

  // Agent completes job
  const res = await fetch(`${baseUrl}/api/agent/jobs/${printJob._id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agentToken}`,
    },
    body: JSON.stringify({
      status: 'completed',
      idempotencyKey: 'idemp-p4a-001',
    }),
  });

  assert.equal(res.status, 200);

  const eventPayload = await completionEventPromise;
  assert.equal(eventPayload.orderNumber, orderNum);
  assert.equal(eventPayload.status, 'completed');
  assert.equal(eventPayload.queueNumber, 42);

  clientSocket.disconnect();
});

// TEST 2: owner.alert persisted in DB and marked read via PATCH /alerts/:alertId/read
test('2. owner.alert persisted in DB and marked read via PATCH /alerts/:alertId/read', async () => {
  const alert = await OwnerAlert.create({
    shop: testShop._id,
    type: 'paper_out',
    message: 'Tray 2 is out of A4 paper.',
    orderNumber: 'EP-P4A-0002',
  });

  // 1. Fetch alerts via owner API
  const getRes = await fetch(`${baseUrl}/api/owner/shops/${testShop._id}/alerts`, {
    headers: {
      Cookie: `token=${ownerToken}`,
    },
  });
  assert.equal(getRes.status, 200);
  const getData = await getRes.json();
  assert.equal(getData.success, true);
  const found = getData.alerts.find(
    (a) => (a.id && a.id.toString() === alert._id.toString()) || (a._id && a._id.toString() === alert._id.toString())
  );
  assert.ok(found);
  assert.equal(found.type, 'paper_out');
  assert.equal(found.readAt, null);

  // 2. Mark alert as read
  const patchRes = await fetch(`${baseUrl}/api/owner/shops/${testShop._id}/alerts/${alert._id}/read`, {
    method: 'PATCH',
    headers: {
      Cookie: `token=${ownerToken}`,
    },
  });
  assert.equal(patchRes.status, 200);
  const patchData = await patchRes.json();
  assert.equal(patchData.success, true);
  assert.ok(patchData.alert.readAt);

  // 3. Verify in database
  const updatedInDb = await OwnerAlert.findById(alert._id);
  assert.ok(updatedInDb.readAt);
});

// TEST 3: Analytics: Seeded dataset returns expected revenue, average turnaround, and failure rate
test('3. Analytics: Seeded dataset returns expected revenue, average turnaround, and failure rate', async () => {
  const now = Date.now();
  const shopOrders = [
    // Completed Order 1: ₹100, turnaround 60s
    {
      orderNumber: 'EP-ANA-01',
      shop: testShop._id,
      customerPhone: '+919999900010',
      status: 'completed',
      totalAmount: 100,
      paidAt: new Date(now - 120000),
      completedAt: new Date(now - 60000), // 60s turnaround
      createdAt: new Date(now - 120000),
    },
    // Completed Order 2: ₹150, turnaround 120s
    {
      orderNumber: 'EP-ANA-02',
      shop: testShop._id,
      customerPhone: '+919999900011',
      status: 'completed',
      totalAmount: 150,
      paidAt: new Date(now - 180000),
      completedAt: new Date(now - 60000), // 120s turnaround
      createdAt: new Date(now - 180000),
    },
    // Failed Order 3: ₹50
    {
      orderNumber: 'EP-ANA-03',
      shop: testShop._id,
      customerPhone: '+919999900012',
      status: 'failed',
      totalAmount: 50,
      paidAt: new Date(now - 60000),
      createdAt: new Date(now - 60000),
    },
    // Refunded Order 4: ₹40
    {
      orderNumber: 'EP-ANA-04',
      shop: testShop._id,
      customerPhone: '+919999900013',
      status: 'refunded',
      totalAmount: 40,
      paidAt: new Date(now - 30000),
      createdAt: new Date(now - 30000),
    },
  ];

  await Order.deleteMany({ shop: testShop._id });
  await Order.insertMany(shopOrders);

  const res = await fetch(`${baseUrl}/api/owner/shops/${testShop._id}/analytics`, {
    headers: {
      Cookie: `token=${ownerToken}`,
    },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);

  // Revenue = 100 + 150 = 250
  assert.equal(data.revenue, 250);
  // RefundsTotal = 40
  assert.equal(data.refundsTotal, 40);
  // Average Turnaround = (60 + 120) / 2 = 90s
  assert.equal(data.averageTurnaroundSeconds, 90);
  assert.equal(data.averageTurnaroundFormatted, '1m 30s');
  // Failure rate = failed / (completed + failed) = 1 / (2 + 1) = 0.333
  assert.equal(data.failureRate, 0.333);
});

// TEST 4: CSV export escapes leading =, +, -, @ characters
test('4. CSV export escapes leading =, +, -, @ characters', async () => {
  await Order.deleteMany({ orderNumber: { $regex: /^=CMD/i } });

  const injectionOrder = await Order.create({
    orderNumber: '=CMD|calc',
    shop: testShop._id,
    customerPhone: '+919999900099',
    status: 'completed',
    totalAmount: 15,
    paidAt: new Date(),
    options: {
      copies: 1,
      colorMode: 'bw',
      sides: 'single',
    },
    breakdown: { effectivePages: 1 },
  });

  const res = await fetch(`${baseUrl}/api/owner/shops/${testShop._id}/orders.csv`, {
    headers: {
      Cookie: `token=${ownerToken}`,
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  const csvText = await res.text();

  // Ensure cell with leading '=' is escaped with a prepended single-quote "'"
  assert.ok(
    csvText.includes("'=CMD|CALC") ||
    csvText.includes("''=CMD|CALC") ||
    csvText.includes("'=CMD|calc")
  );

  await Order.findByIdAndDelete(injectionOrder._id);
});

// TEST 5: Admin RBAC: Owner calling /api/admin/* gets 403
test('5. Admin RBAC: Owner calling /api/admin/* gets 403', async () => {
  const res = await fetch(`${baseUrl}/api/admin/shops`, {
    headers: {
      Cookie: `token=${ownerToken}`, // Owner user role
    },
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.message, /Admin permissions required|Forbidden|Administrator/i);
});

// TEST 6: Suspending a shop hides it from GET /api/shops/:slug (404) and blocks new orders (400)
test('6. Suspending a shop hides it from GET /api/shops/:slug (404) and blocks new orders (400)', async () => {
  // Suspend the shop
  testShop.status = 'suspended';
  await testShop.save();

  // 1. GET /api/shops/:slug should return 404
  const getRes = await fetch(`${baseUrl}/api/shops/${testShop.slug}`);
  assert.equal(getRes.status, 404);

  // 2. POST /api/orders/draft should return 400
  const { stagedFilesStore } = await import('../src/controllers/uploadController.js');
  const stagedFileId = 'staged_p4a_suspend_test_file';
  stagedFilesStore.set(stagedFileId, {
    id: stagedFileId,
    originalName: 'dummy.pdf',
    mimeType: 'application/pdf',
    storageKey: 'dummy.pdf',
    sizeBytes: 100,
    pageCount: 1,
  });

  const draftRes = await fetch(`${baseUrl}/api/orders/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shopSlug: testShop.slug,
      customerPhone: '+919876543210',
      fileIds: [stagedFileId],
      options: {
        copies: 1,
        colorMode: 'bw',
        sides: 'single',
      },
    }),
  });
  assert.equal(draftRes.status, 400);
  const draftData = await draftRes.json();
  assert.equal(draftData.success, false);
  assert.match(draftData.message, /suspended/i);

  // Restore shop status
  testShop.status = 'active';
  await testShop.save();

  const restoreRes = await fetch(`${baseUrl}/api/shops/${testShop.slug}`);
  assert.equal(restoreRes.status, 200);
});

// TEST 7: Admin cannot suspend or demote themselves (400)
test('7. Admin cannot suspend or demote themselves (400)', async () => {
  // Attempt self-suspension
  const suspendRes = await fetch(`${baseUrl}/api/admin/users/${adminUser._id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `token=${adminToken}`,
    },
    body: JSON.stringify({ isSuspended: true }),
  });
  assert.equal(suspendRes.status, 400);
  const suspendData = await suspendRes.json();
  assert.match(suspendData.message, /cannot modify their own/i);

  // Attempt self-demotion
  const demoteRes = await fetch(`${baseUrl}/api/admin/users/${adminUser._id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `token=${adminToken}`,
    },
    body: JSON.stringify({ role: 'owner' }),
  });
  assert.equal(demoteRes.status, 400);
  const demoteData = await demoteRes.json();
  assert.match(demoteData.message, /cannot modify their own/i);
});

// TEST 8: AdminAction audit record written on every admin mutation
test('8. AdminAction audit record written on every admin mutation', async () => {
  // Admin suspends shop
  const res1 = await fetch(`${baseUrl}/api/admin/shops/${testShop._id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `token=${adminToken}`,
    },
    body: JSON.stringify({ status: 'suspended' }),
  });
  assert.equal(res1.status, 200);

  // Verify AdminAction log
  const audit1 = await AdminAction.findOne({
    targetType: 'shop',
    targetId: testShop._id.toString(),
    action: 'suspend_shop',
  }).sort({ createdAt: -1 });

  assert.ok(audit1);
  assert.equal(audit1.adminId.toString(), adminUser._id.toString());
  assert.equal(audit1.before.status, 'active');
  assert.equal(audit1.after.status, 'suspended');

  // Admin re-activates shop
  const res2 = await fetch(`${baseUrl}/api/admin/shops/${testShop._id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `token=${adminToken}`,
    },
    body: JSON.stringify({ status: 'active' }),
  });
  assert.equal(res2.status, 200);

  const audit2 = await AdminAction.findOne({
    targetType: 'shop',
    targetId: testShop._id.toString(),
    action: 'activate_shop',
  }).sort({ createdAt: -1 });

  assert.ok(audit2);
  assert.equal(audit2.before.status, 'suspended');
  assert.equal(audit2.after.status, 'active');
});

// TEST 9: Retention: Completed order's file bytes deleted, signed URL returns 410 Gone, Order record and totals remain
test("9. Retention: Completed order's file bytes deleted, signed URL returns 410 Gone, Order record and totals remain", async () => {
  // 1. Create a dummy file in storage
  const dummyFilename = `retention-test-${Date.now()}.pdf`;
  const dummyFilePath = path.join(TEMP_UPLOAD_DIR, dummyFilename);
  fs.writeFileSync(dummyFilePath, Buffer.from('%PDF-1.4 dummy retention content'));

  const orderNum = 'EP-RET-0001';
  await Order.deleteMany({ orderNumber: orderNum });

  // Order completed 26 hours ago
  const completedDate = new Date(Date.now() - 26 * 3600 * 1000);
  const order = await Order.create({
    orderNumber: orderNum,
    shop: testShop._id,
    customerPhone: '+919999900077',
    status: 'completed',
    totalAmount: 45.0,
    paidAt: completedDate,
    completedAt: completedDate,
  });

  const orderFile = await OrderFile.create({
    order: order._id,
    originalName: 'lecture_notes.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storageKey: dummyFilename,
    pageCount: 10,
    deletedAt: null,
  });

  assert.equal(fs.existsSync(dummyFilePath), true);

  // 2. Trigger retention purge
  const purgeResult = await purgeRetainedFiles();
  assert.ok(purgeResult.deletedFilesCount >= 1);

  // 3. Confirm physical file bytes are deleted from storage
  assert.equal(fs.existsSync(dummyFilePath), false);

  // 4. Confirm OrderFile.deletedAt is set
  const updatedOrderFile = await OrderFile.findById(orderFile._id);
  assert.ok(updatedOrderFile.deletedAt);

  // 5. Confirm signed URL download returns 410 Gone
  const { getSignedDownloadUrl } = await import('../src/config/storage.js');
  const signedUrl = await getSignedDownloadUrl(dummyFilename, 300, baseUrl);
  const downloadRes = await fetch(signedUrl);
  assert.equal(downloadRes.status, 410);
  const downloadData = await downloadRes.json();
  assert.equal(downloadData.success, false);
  assert.match(downloadData.message, /retention policy/i);

  // 6. Confirm Order document and financial totals remain intact
  const finalOrder = await Order.findById(order._id);
  assert.ok(finalOrder);
  assert.equal(finalOrder.totalAmount, 45.0);
  assert.equal(finalOrder.status, 'completed');
});

// TEST 10: Dev mark-paid returns 403 when RAZORPAY_KEY_ID is set or NODE_ENV === 'production'
test('10. Dev mark-paid returns 403 when RAZORPAY_KEY_ID is set or NODE_ENV === production', async () => {
  const origSim = process.env.ALLOW_DEV_PAYMENT_SIMULATION;
  process.env.ALLOW_DEV_PAYMENT_SIMULATION = 'true';

  // Test case A: RAZORPAY_KEY_ID is set
  process.env.RAZORPAY_KEY_ID = 'rzp_live_test_key_123';
  const resWithRzpKey = await fetch(`${baseUrl}/api/dev/orders/EP-P4A-DEV1/mark-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(resWithRzpKey.status, 403);
  delete process.env.RAZORPAY_KEY_ID;

  // Test case B: NODE_ENV is production
  process.env.NODE_ENV = 'production';
  const resInProd = await fetch(`${baseUrl}/api/dev/orders/EP-P4A-DEV2/mark-paid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(resInProd.status, 403);
  process.env.NODE_ENV = 'test';

  if (origSim !== undefined) {
    process.env.ALLOW_DEV_PAYMENT_SIMULATION = origSim;
  } else {
    delete process.env.ALLOW_DEV_PAYMENT_SIMULATION;
  }
});

// TEST 11: CORS refuses unlisted origin
test('11. CORS refuses unlisted origin', async () => {
  const unlistedOrigin = 'https://unauthorized-phishing-site.com';
  const res = await fetch(`${baseUrl}/api/shops/${testShop.slug}`, {
    headers: {
      Origin: unlistedOrigin,
    },
  });

  // Either blocked with 403 by CORS error handler or header does not reflect unlisted origin
  const allowOrigin = res.headers.get('access-control-allow-origin');
  assert.notEqual(allowOrigin, unlistedOrigin);
});

// TEST 12: Production startup refuses to boot with default JWT_SECRET
test('12. Production startup refuses to boot with default JWT_SECRET', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalJwt = process.env.JWT_SECRET;
  const originalRzp = process.env.RAZORPAY_KEY_SECRET;
  const originalWebhook = process.env.RAZORPAY_WEBHOOK_SECRET;

  try {
    process.env.NODE_ENV = 'production';

    // Default secret should throw
    process.env.JWT_SECRET = 'easyprint_super_secret_jwt_key_2026';
    assert.throws(
      () => validateProductionSecrets(),
      /missing or default JWT_SECRET/i
    );

    // Empty secret should throw
    process.env.JWT_SECRET = '';
    assert.throws(
      () => validateProductionSecrets(),
      /missing or default JWT_SECRET/i
    );

    // Valid JWT secret but default Razorpay secret should throw
    process.env.JWT_SECRET = 'strong_and_unique_production_jwt_secret_999';
    process.env.RAZORPAY_KEY_SECRET = 'default';
    assert.throws(
      () => validateProductionSecrets(),
      /missing or default RAZORPAY_KEY_SECRET/i
    );

    // All valid production secrets should pass without throwing
    process.env.RAZORPAY_KEY_SECRET = 'valid_custom_rzp_production_secret_888';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'valid_custom_rzp_webhook_secret_777';
    assert.doesNotThrow(() => validateProductionSecrets());
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.JWT_SECRET = originalJwt;
    process.env.RAZORPAY_KEY_SECRET = originalRzp;
    process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhook;
  }
});
