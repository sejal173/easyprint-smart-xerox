/**
 * EasyPrint Razorpay Webhook Verification Script
 *
 * Tests the webhook processing path without requiring real cards or merchant KYC:
 * 1. Sends signed payment.captured webhook using RAZORPAY_WEBHOOK_SECRET from env
 * 2. Confirms order transitions from pending_payment to queued
 * 3. Sends identical event a second time to verify webhook idempotency (no duplicate processing)
 * 4. Sends payment.failed webhook and confirms order remains pending_payment
 *
 * Usage:
 *   node scripts/test-webhook.js
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from server/.env if not present in process.env
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../server/.env') });

const API_URL = process.env.API_URL || 'http://localhost:5000';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error('\x1b[31m[ERROR]\x1b[0m Missing RAZORPAY_WEBHOOK_SECRET environment variable.');
  console.error('Configure RAZORPAY_WEBHOOK_SECRET in server/.env or export it in your shell before running.');
  process.exit(1);
}

function signPayload(rawString, secret) {
  return crypto.createHmac('sha256', secret).update(rawString).digest('hex');
}

async function sendWebhook(payloadObj, eventId, secret = WEBHOOK_SECRET) {
  const rawString = JSON.stringify(payloadObj);
  const signature = signPayload(rawString, secret);

  const res = await fetch(`${API_URL}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': eventId,
    },
    body: rawString,
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function runWebhookTests() {
  console.log('===========================================================');
  console.log(' EasyPrint Razorpay Webhook Verification (No Real Card)');
  console.log(` Target API: ${API_URL}`);
  console.log('===========================================================\n');

  try {
    // Connect to database to create test orders for webhook targeting
    const { connectDB } = await import('../server/src/config/db.js');
    const { Order, Shop } = await import('../server/src/models/index.js');
    await connectDB();

    const shop = await Shop.findOne({ slug: 'quickcopy-central' });
    if (!shop) {
      throw new Error('Demo shop "quickcopy-central" not found. Please run seed script first.');
    }

    // -------------------------------------------------------------
    // TEST 1: payment.captured transitions order to QUEUED
    // -------------------------------------------------------------
    const rzpOrderId1 = `order_test_${Date.now()}_1`;
    const rzpPaymentId1 = `pay_test_${Date.now()}_1`;
    const orderNum1 = `EP-WH-CAP-${Date.now().toString().slice(-4)}`;

    await Order.deleteMany({ orderNumber: orderNum1 });
    const order1 = await Order.create({
      shop: shop._id,
      orderNumber: orderNum1,
      customerPhone: '+919999900001',
      totalAmount: 10.0,
      currency: 'INR',
      status: 'pending_payment',
      razorpayOrderId: rzpOrderId1,
    });

    const eventId1 = `evt_capture_${Date.now()}`;
    const capturePayload = {
      entity: 'event',
      account_id: 'acc_test_merchant',
      event: 'payment.captured',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: rzpPaymentId1,
            entity: 'payment',
            amount: 1000,
            currency: 'INR',
            status: 'captured',
            order_id: rzpOrderId1,
            method: 'card',
            captured: true,
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    console.log(`>> Sending signed 'payment.captured' webhook for order #${orderNum1}...`);
    const res1 = await sendWebhook(capturePayload, eventId1);

    if (res1.status !== 200) {
      throw new Error(`payment.captured webhook returned HTTP ${res1.status}: ${JSON.stringify(res1.data)}`);
    }

    // Verify order status in DB
    const updatedOrder1 = await Order.findOne({ orderNumber: orderNum1 });
    if (updatedOrder1.status !== 'queued') {
      throw new Error(`Expected order status to be 'queued', but got '${updatedOrder1.status}'`);
    }
    console.log('\x1b[32m[PASS]\x1b[0m Check 1: payment.captured successfully transitioned order to QUEUED');

    // -------------------------------------------------------------
    // TEST 2: Idempotency (Sending same eventId twice is a NO-OP)
    // -------------------------------------------------------------
    console.log(`\n>> Sending identical event (${eventId1}) a second time for idempotency check...`);
    const res2 = await sendWebhook(capturePayload, eventId1);

    if (res2.status !== 200) {
      throw new Error(`Duplicate webhook returned HTTP ${res2.status}`);
    }
    if (!res2.data.message || !res2.data.message.includes('already processed')) {
      throw new Error(`Expected 'already processed' message on duplicate webhook, got: ${JSON.stringify(res2.data)}`);
    }

    const recheckOrder1 = await Order.findOne({ orderNumber: orderNum1 });
    if (recheckOrder1.status !== 'queued') {
      throw new Error(`Order state corrupted on duplicate webhook: ${recheckOrder1.status}`);
    }
    console.log('\x1b[32m[PASS]\x1b[0m Check 2: Idempotency verified: duplicate event returned 200 and was a no-op');

    // -------------------------------------------------------------
    // TEST 3: payment.failed leaves order in PENDING_PAYMENT
    // -------------------------------------------------------------
    const rzpOrderId2 = `order_test_${Date.now()}_2`;
    const rzpPaymentId2 = `pay_test_${Date.now()}_2`;
    const orderNum2 = `EP-WH-FAIL-${Date.now().toString().slice(-4)}`;

    await Order.deleteMany({ orderNumber: orderNum2 });
    const order2 = await Order.create({
      shop: shop._id,
      orderNumber: orderNum2,
      customerPhone: '+919999900002',
      totalAmount: 15.0,
      currency: 'INR',
      status: 'pending_payment',
      razorpayOrderId: rzpOrderId2,
    });

    const eventId2 = `evt_failed_${Date.now()}`;
    const failedPayload = {
      entity: 'event',
      account_id: 'acc_test_merchant',
      event: 'payment.failed',
      contains: ['payment'],
      payload: {
        payment: {
          entity: {
            id: rzpPaymentId2,
            entity: 'payment',
            amount: 1500,
            currency: 'INR',
            status: 'failed',
            order_id: rzpOrderId2,
            method: 'card',
            captured: false,
            error_code: 'BAD_REQUEST_ERROR',
            error_description: 'Payment was declined by bank',
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };

    console.log(`\n>> Sending signed 'payment.failed' webhook for order #${orderNum2}...`);
    const res3 = await sendWebhook(failedPayload, eventId2);

    if (res3.status !== 200) {
      throw new Error(`payment.failed webhook returned HTTP ${res3.status}: ${JSON.stringify(res3.data)}`);
    }

    const updatedOrder2 = await Order.findOne({ orderNumber: orderNum2 });
    if (updatedOrder2.status !== 'pending_payment') {
      throw new Error(`Expected order to stay 'pending_payment' on payment.failed, but got '${updatedOrder2.status}'`);
    }
    console.log('\x1b[32m[PASS]\x1b[0m Check 3: payment.failed verified: order remains in PENDING_PAYMENT status');

    console.log('\n===========================================================');
    console.log('\x1b[32m [SUCCESS] All 3 Razorpay webhook checks passed cleanly!\x1b[0m');
    console.log('===========================================================\n');

    const mongoose = (await import('mongoose')).default;
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n\x1b[31m[FAIL]\x1b[0m Webhook test failed:', err.message);
    try {
      const mongoose = (await import('mongoose')).default;
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  }
}

runWebhookTests();
