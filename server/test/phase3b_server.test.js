process.env.NODE_ENV = 'test';
process.env.AGENT_LEASE_SECONDS = '300';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import crypto from 'crypto';

import { app, io as serverIo } from '../src/server.js';
import { connectDB } from '../src/config/db.js';
import { getRedisClient, closeRedis } from '../src/config/redis.js';
import { initStorage } from '../src/config/storage.js';
import {
  User,
  Shop,
  Order,
  PrintJob,
  AgentDevice,
} from '../src/models/index.js';
import { sweepExpiredLeases } from '../src/controllers/agentController.js';

let server;
let baseUrl;
let shop1;
let shop2;
let agent1Token;
let agent1Device;
let agent2Token;
let agent2Device;
let otherShopAgentToken;
let otherShopAgentDevice;

test.before(async () => {
  await initStorage();
  await connectDB();
  getRedisClient();

  // Create or fetch two distinct shops for cross-tenant isolation testing
  shop1 = await Shop.findOne({ slug: 'quickcopy-central' });

  let owner = await User.findOne({ email: 'owner@easyprint.test' });
  shop2 = await Shop.findOne({ slug: 'second-test-shop' });
  if (!shop2) {
    shop2 = await Shop.create({
      owner: owner._id,
      name: 'Second Test Shop',
      slug: 'second-test-shop',
      address: 'Test Address 2',
      phone: '+919876543212',
      email: 'shop2@easyprint.test',
      isOnline: true,
      status: 'active',
    });
  }

  // Device 1 for Shop 1
  agent1Token = crypto.randomBytes(32).toString('hex');
  const hash1 = crypto.createHash('sha256').update(agent1Token).digest('hex');
  agent1Device = await AgentDevice.create({
    shop: shop1._id,
    name: 'Shop 1 Agent A',
    tokenHash: hash1,
    lastHeartbeatAt: new Date(),
    printerStatus: 'ready',
    isRevoked: false,
  });

  // Device 2 for Shop 1 (same shop, different device to test ownership check)
  agent2Token = crypto.randomBytes(32).toString('hex');
  const hash2 = crypto.createHash('sha256').update(agent2Token).digest('hex');
  agent2Device = await AgentDevice.create({
    shop: shop1._id,
    name: 'Shop 1 Agent B',
    tokenHash: hash2,
    lastHeartbeatAt: new Date(),
    printerStatus: 'ready',
    isRevoked: false,
  });

  // Device for Shop 2 (to test shop isolation)
  otherShopAgentToken = crypto.randomBytes(32).toString('hex');
  const hashOther = crypto.createHash('sha256').update(otherShopAgentToken).digest('hex');
  otherShopAgentDevice = await AgentDevice.create({
    shop: shop2._id,
    name: 'Shop 2 Agent',
    tokenHash: hashOther,
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
  await closeRedis();
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
});

test('1. Lease renewal (POST /api/agent/jobs/:id/lease): successfully extends lease by AGENT_LEASE_SECONDS', async () => {
  const order = await Order.create({
    orderNumber: 'TEST-P3B-LEASE-01',
    shop: shop1._id,
    status: 'printing',
    totalAmount: 15,
    options: { copies: 1 },
  });

  const originalExpiry = new Date(Date.now() + 60000);
  const printJob = await PrintJob.create({
    order: order._id,
    shop: shop1._id,
    agentDevice: agent1Device._id,
    status: 'printing',
    leaseExpiresAt: originalExpiry,
    spoolerJobId: 442,
  });

  const res = await fetch(`${baseUrl}/api/agent/jobs/${printJob._id}/lease`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agent1Token}`,
    },
    body: JSON.stringify({ idempotencyKey: 'lease_renew_key_1' }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.leaseExpiresAt);

  const updatedExpiry = new Date(data.leaseExpiresAt).getTime();
  const diffSecs = (updatedExpiry - Date.now()) / 1000;
  // Should be close to 300 seconds
  assert.ok(diffSecs > 280 && diffSecs <= 305);

  const dbJob = await PrintJob.findById(printJob._id);
  assert.equal(dbJob.lastIdempotencyKey, 'lease_renew_key_1');
  assert.equal(dbJob.leaseExpiresAt.toISOString(), new Date(data.leaseExpiresAt).toISOString());

  // Clean up
  await Order.findByIdAndDelete(order._id);
  await PrintJob.findByIdAndDelete(printJob._id);
});

test('2. Lease renewal ownership check: 409 if job is owned by a different device', async () => {
  const order = await Order.create({
    orderNumber: 'TEST-P3B-OWNER-01',
    shop: shop1._id,
    status: 'queued',
    totalAmount: 10,
    options: { copies: 1 },
  });

  // Owned by agent1Device
  const printJob = await PrintJob.create({
    order: order._id,
    shop: shop1._id,
    agentDevice: agent1Device._id,
    status: 'claimed',
    leaseExpiresAt: new Date(Date.now() + 100000),
  });

  // agent2Device tries to renew agent1Device's job
  const res = await fetch(`${baseUrl}/api/agent/jobs/${printJob._id}/lease`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agent2Token}`,
    },
  });

  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.success, false);
  assert.match(data.message, /no longer owned by this device/i);

  // Clean up
  await Order.findByIdAndDelete(order._id);
  await PrintJob.findByIdAndDelete(printJob._id);
});

test('3. Cross-shop isolation: other shop token gets 404', async () => {
  const order = await Order.create({
    orderNumber: 'TEST-P3B-ISOLATION-01',
    shop: shop1._id,
    status: 'queued',
    totalAmount: 10,
    options: { copies: 1 },
  });

  const printJob = await PrintJob.create({
    order: order._id,
    shop: shop1._id,
    agentDevice: agent1Device._id,
    status: 'claimed',
    leaseExpiresAt: new Date(Date.now() + 100000),
  });

  // otherShopAgentToken attempts lease renewal on Shop 1's job
  const leaseRes = await fetch(`${baseUrl}/api/agent/jobs/${printJob._id}/lease`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${otherShopAgentToken}`,
    },
  });
  assert.equal(leaseRes.status, 404);

  // otherShopAgentToken attempts status query on Shop 1's job
  const statusRes = await fetch(`${baseUrl}/api/agent/jobs/${printJob._id}/status`, {
    headers: {
      Authorization: `Bearer ${otherShopAgentToken}`,
    },
  });
  assert.equal(statusRes.status, 404);

  // Clean up
  await Order.findByIdAndDelete(order._id);
  await PrintJob.findByIdAndDelete(printJob._id);
});

test('4. Reconciliation endpoint (GET /api/agent/jobs/:id/status): returns server status for post-restart recovery', async () => {
  const order = await Order.create({
    orderNumber: 'TEST-P3B-RECON-01',
    shop: shop1._id,
    status: 'printing',
    totalAmount: 25,
    options: { copies: 1 },
  });

  const printJob = await PrintJob.create({
    order: order._id,
    shop: shop1._id,
    agentDevice: agent1Device._id,
    status: 'printing',
    attemptCount: 2,
    spoolerJobId: 9941,
    leaseExpiresAt: new Date(Date.now() + 150000),
  });

  const res = await fetch(`${baseUrl}/api/agent/jobs/${printJob._id}/status`, {
    headers: {
      Authorization: `Bearer ${agent1Token}`,
    },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.jobId, printJob._id.toString());
  assert.equal(data.status, 'printing');
  assert.equal(data.attemptCount, 2);
  assert.equal(data.spoolerJobId, 9941);
  assert.equal(data.orderNumber, 'TEST-P3B-RECON-01');

  // Clean up
  await Order.findByIdAndDelete(order._id);
  await PrintJob.findByIdAndDelete(printJob._id);
});

test('5. Auth security: revoked token gets 401, missing token gets 401', async () => {
  // Revoke device 2
  agent2Device.isRevoked = true;
  await agent2Device.save();

  const revokedRes = await fetch(`${baseUrl}/api/agent/jobs/some_id/status`, {
    headers: { Authorization: `Bearer ${agent2Token}` },
  });
  assert.equal(revokedRes.status, 401);
  const revokedData = await revokedRes.json();
  assert.match(revokedData.message, /invalid or revoked/i);

  // Missing token
  const missingRes = await fetch(`${baseUrl}/api/agent/jobs/some_id/status`);
  assert.equal(missingRes.status, 401);

  // Restore
  agent2Device.isRevoked = false;
  await agent2Device.save();
});

test('6. Sweeper test: printing job renewed twice across interval > original lease is NEVER requeued', async () => {
  const order = await Order.create({
    orderNumber: 'TEST-P3B-SWEEP-01',
    shop: shop1._id,
    status: 'printing',
    totalAmount: 20,
    options: { copies: 1 },
  });

  // Short initial lease of 5 seconds
  const printJob = await PrintJob.create({
    order: order._id,
    shop: shop1._id,
    agentDevice: agent1Device._id,
    status: 'printing',
    attemptCount: 1,
    leaseExpiresAt: new Date(Date.now() + 5000),
  });

  // First renewal: extends lease to +10 seconds
  const renew1Res = await fetch(`${baseUrl}/api/agent/jobs/${printJob._id}/lease`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agent1Token}`,
    },
  });
  assert.equal(renew1Res.status, 200);

  // Trigger lease sweeper: should NOT requeue because lease is active
  await sweepExpiredLeases(serverIo);
  let checkJob = await PrintJob.findById(printJob._id);
  assert.equal(checkJob.status, 'printing');

  // Second renewal: extends lease again
  const renew2Res = await fetch(`${baseUrl}/api/agent/jobs/${printJob._id}/lease`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${agent1Token}`,
    },
  });
  assert.equal(renew2Res.status, 200);

  // Trigger lease sweeper again
  await sweepExpiredLeases(serverIo);
  checkJob = await PrintJob.findById(printJob._id);
  assert.equal(checkJob.status, 'printing');

  const checkOrder = await Order.findById(order._id);
  assert.equal(checkOrder.status, 'printing');

  // Clean up
  await Order.findByIdAndDelete(order._id);
  await PrintJob.findByIdAndDelete(printJob._id);
});
