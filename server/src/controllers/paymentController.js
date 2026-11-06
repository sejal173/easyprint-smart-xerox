import crypto from 'crypto';
import { z } from 'zod';
import { Order, OrderFile, Shop, Payment, WebhookEvent } from '../models/index.js';
import { calculatePrintPrice, DEFAULT_PRICE_SETTINGS } from '@easyprint/shared';
import { getRazorpayClient } from '../config/razorpay.js';
import { markOrderPaid } from '../services/orderQueueService.js';

const createOrderSchema = z.object({
  orderNumber: z.string().min(1, 'Order number is required').trim(),
});

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, 'razorpay_order_id is required').trim(),
  razorpay_payment_id: z.string().min(1, 'razorpay_payment_id is required').trim(),
  razorpay_signature: z.string().min(1, 'razorpay_signature is required').trim(),
});

/**
 * Creates a Razorpay payment order for an existing draft/pending_payment order.
 * Recomputes the total amount on the server authoritatively.
 */
export async function createPaymentOrder(req, res, next) {
  try {
    const parseResult = createOrderSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { orderNumber } = parseResult.data;
    const order = await Order.findOne({ orderNumber: orderNumber.toUpperCase() });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order "${orderNumber}" not found.`,
      });
    }

    if (!['draft', 'pending_payment'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot initiate payment for order in status "${order.status}".`,
      });
    }

    const shop = await Shop.findById(order.shop);
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: 'Shop associated with this order was not found.',
      });
    }

    if (!shop.isOnline || shop.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Shop is currently offline and not accepting payments.',
      });
    }

    // Recompute total amount on server authoritatively
    const orderFiles = await OrderFile.find({ order: order._id });
    const priceSettings = shop.priceSettings || DEFAULT_PRICE_SETTINGS;
    const calculatedPrice = calculatePrintPrice({
      files: orderFiles,
      options: order.options,
      priceSettings,
    });

    const amountInPaise = Math.round(calculatedPrice.totalAmount * 100);

    const rzp = getRazorpayClient();
    const rzpOrder = await rzp.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        orderNumber: order.orderNumber,
        shopId: shop._id.toString(),
      },
    });

    // Update order with razorpayOrderId and pending_payment status
    order.status = 'pending_payment';
    order.razorpayOrderId = rzpOrder.id;
    order.totalAmount = calculatedPrice.totalAmount;
    order.breakdown = calculatedPrice.breakdown;
    await order.save();

    // Create or update Payment record
    await Payment.findOneAndUpdate(
      { razorpayOrderId: rzpOrder.id },
      {
        order: order._id,
        razorpayOrderId: rzpOrder.id,
        amount: amountInPaise,
        currency: 'INR',
        status: 'created',
      },
      { upsert: true, new: true }
    );

    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';

    return res.status(200).json({
      success: true,
      keyId,
      razorpayOrderId: rzpOrder.id,
      amount: amountInPaise,
      currency: 'INR',
      orderNumber: order.orderNumber,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Verifies Razorpay HMAC-SHA256 signature and enqueues the order.
 */
export async function verifyPayment(req, res, next) {
  try {
    const parseResult = verifyPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment verification parameters',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parseResult.data;

    const secret = process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder';
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    let isValid = false;
    try {
      isValid =
        generatedSignature.length === razorpay_signature.length &&
        crypto.timingSafeEqual(Buffer.from(generatedSignature), Buffer.from(razorpay_signature));
    } catch {
      isValid = false;
    }

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature',
      });
    }

    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order for Razorpay order ID "${razorpay_order_id}" not found.`,
      });
    }

    // Record Payment
    await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        order: order._id,
        razorpayPaymentId: razorpay_payment_id,
        status: 'paid',
      },
      { upsert: true }
    );

    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();

    // Mark paid and enqueue via shared orderQueueService
    const io = req.app.get('io');
    const { order: updatedOrder, isAlreadyQueued } = await markOrderPaid(order.orderNumber, io);

    return res.status(200).json({
      success: true,
      message: isAlreadyQueued ? 'Order was already queued' : 'Payment verified and order enqueued',
      order: {
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
        queueNumber: updatedOrder.queueNumber,
        paidAt: updatedOrder.paidAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Webhook handler for Razorpay asynchronous events.
 * Expects raw body buffer for HMAC-SHA256 signature verification.
 */
export async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing X-Razorpay-Signature header',
      });
    }

    const rawBody = req.body;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({
        success: false,
        message: 'Expected raw request body for webhook verification',
      });
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || 'rzp_webhook_secret';
    const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    let isValid = false;
    try {
      isValid =
        signature.length === expectedSignature.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch {
      isValid = false;
    }

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature',
      });
    }

    // Parse event payload
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }

    const eventId = req.headers['x-razorpay-event-id'] || event.id || `evt_${Date.now()}_${Math.random()}`;

    // Idempotency: Ignore already processed events
    try {
      await WebhookEvent.create({
        eventId,
        eventType: event.event || 'unknown',
        processedAt: new Date(),
        payload: event,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Event already processed
        return res.status(200).json({ success: true, message: 'Event already processed' });
      }
      throw err;
    }

    const io = req.app.get('io');

    switch (event.event) {
      case 'payment.captured': {
        const paymentEntity = event.payload?.payment?.entity;
        if (paymentEntity?.order_id) {
          const razorpayOrderId = paymentEntity.order_id;
          const razorpayPaymentId = paymentEntity.id;

          const order = await Order.findOne({ razorpayOrderId });
          if (order) {
            order.razorpayPaymentId = razorpayPaymentId;
            await order.save();

            await Payment.findOneAndUpdate(
              { razorpayOrderId },
              {
                order: order._id,
                razorpayPaymentId,
                amount: paymentEntity.amount,
                status: 'paid',
              },
              { upsert: true }
            );

            await markOrderPaid(order.orderNumber, io);
          }
        }
        break;
      }

      case 'payment.failed': {
        const paymentEntity = event.payload?.payment?.entity;
        if (paymentEntity?.order_id) {
          const razorpayOrderId = paymentEntity.order_id;
          const order = await Order.findOne({ razorpayOrderId });
          if (order) {
            await Payment.findOneAndUpdate(
              { razorpayOrderId },
              { status: 'failed' },
              { upsert: true }
            );

            if (io) {
              io.to(`order:${order.orderNumber}`).emit('order.status', {
                orderNumber: order.orderNumber,
                status: 'payment_failed',
                message: 'Payment failed. Please retry checkout.',
              });
            }
          }
        }
        break;
      }

      case 'refund.processed': {
        const refundEntity = event.payload?.refund?.entity;
        if (refundEntity) {
          const paymentId = refundEntity.payment_id;
          const payment = await Payment.findOne({ razorpayPaymentId: paymentId });
          if (payment) {
            payment.status = 'refunded';
            payment.refundId = refundEntity.id;
            await payment.save();

            const order = await Order.findById(payment.order);
            if (order) {
              order.status = 'refunded';
              await order.save();

              if (io) {
                io.to(`order:${order.orderNumber}`).emit('order.status', {
                  orderNumber: order.orderNumber,
                  status: 'refunded',
                });
              }
            }
          }
        }
        break;
      }

      default:
        // Ignore unrecognized events gracefully
        break;
    }

    return res.status(200).json({ success: true, message: 'Webhook processed' });
  } catch (err) {
    next(err);
  }
}

