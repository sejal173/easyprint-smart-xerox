import QRCode from 'qrcode';
import { z } from 'zod';
import { Shop } from '../models/Shop.js';
import { ShopQrCode } from '../models/ShopQrCode.js';
import { Order } from '../models/Order.js';
import { OrderFile } from '../models/OrderFile.js';
import { PrintJob } from '../models/PrintJob.js';
import { Payment } from '../models/Payment.js';
import { AgentDevice } from '../models/AgentDevice.js';
import { OwnerAlert } from '../models/OwnerAlert.js';
import crypto from 'crypto';
import { getOwnerShopOr404 } from '../middleware/authMiddleware.js';
import { getRazorpayClient } from '../config/razorpay.js';
import { getShopQueue, getRedisClient } from '../config/redis.js';
import { emitQueueAndOrderStatus } from '../services/orderQueueService.js';
import { recordOrderEvent } from '../services/orderEventService.js';

/**
 * Generates URL-friendly slug from name with unique suffix if needed
 */
async function generateUniqueSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  let slug = base || 'shop';
  let counter = 1;
  while (await Shop.findOne({ slug })) {
    slug = `${base}-${counter}`;
    counter++;
  }
  return slug;
}

const shopCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  address: z.string().trim().min(5, 'Address is required'),
  phone: z.string().trim().min(7, 'Phone number is required'),
  email: z.string().trim().email('Valid email is required'),
  maxQueue: z.number().int().min(1).default(100),
  priceSettings: z
    .object({
      bwPerPage: z.number().min(0).default(2.0),
      colorPerPage: z.number().min(0).default(10.0),
      duplexDiscount: z.number().min(0).default(0.5),
      a3Multiplier: z.number().min(1).default(2.0),
      glossyPaperSurcharge: z.number().min(0).default(5.0),
    })
    .optional(),
  openingHours: z
    .array(
      z.object({
        day: z.string(),
        open: z.string().default('09:00'),
        close: z.string().default('21:00'),
      })
    )
    .optional()
    .default([]),
});

/**
 * Create a new shop for the authenticated owner
 */
export async function createShop(req, res, next) {
  try {
    const parse = shopCreateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: parse.error.flatten().fieldErrors,
      });
    }

    const { name, address, phone, email, maxQueue, priceSettings, openingHours } = parse.data;
    const slug = await generateUniqueSlug(name);

    const shop = await Shop.create({
      owner: req.user._id,
      name,
      slug,
      address,
      phone,
      email,
      maxQueue: maxQueue || 100,
      priceSettings: priceSettings || {},
      openingHours: openingHours || [],
      isOnline: true,
      status: 'active',
      isApproved: true,
    });

    // Generate initial QR code
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const publicUrl = `${clientUrl}/s/${shop.slug}`;
    const pngDataUrl = await QRCode.toDataURL(publicUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#0284c7', light: '#ffffff' },
    });

    await ShopQrCode.create({
      shop: shop._id,
      publicUrl,
      pngDataUrl,
    });

    return res.status(201).json({
      success: true,
      message: 'Shop created successfully',
      shop,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List all shops belonging to the authenticated owner
 */
export async function getOwnerShops(req, res, next) {
  try {
    const shops = await Shop.find({ owner: req.user._id }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      shops,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get shop profile details by ID
 */
export async function getOwnerShopById(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    return res.status(200).json({
      success: true,
      shop,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update shop profile and price settings
 */
export async function updateOwnerShop(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);

    const { name, address, phone, email, priceSettings, maxQueue, openingHours } = req.body;
    if (name) shop.name = name;
    if (address) shop.address = address;
    if (phone) shop.phone = phone;
    if (email) shop.email = email;
    if (maxQueue !== undefined) shop.maxQueue = maxQueue;
    if (priceSettings) shop.priceSettings = { ...shop.priceSettings, ...priceSettings };
    if (openingHours) shop.openingHours = openingHours;

    await shop.save();

    return res.status(200).json({
      success: true,
      message: 'Shop updated successfully',
      shop,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Toggle shop online / offline status and emit Socket.IO event
 */
export async function updateShopStatus(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);

    if (typeof req.body.isOnline !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isOnline boolean is required',
      });
    }

    shop.isOnline = req.body.isOnline;
    await shop.save();

    // Emit shop.status to room shop:<id>
    const io = req.app.get('io');
    if (io) {
      io.to(`shop:${shop._id}`).emit('shop.status', {
        shopId: shop._id.toString(),
        isOnline: shop.isOnline,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Shop is now ${shop.isOnline ? 'Online' : 'Offline'}`,
      isOnline: shop.isOnline,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Manage Printers
 */
export async function getPrinters(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    return res.status(200).json({
      success: true,
      printers: shop.printers || [],
    });
  } catch (err) {
    next(err);
  }
}

export async function addPrinter(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { name, colorSupport, duplexSupport, paperSizes, isDefault } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, message: 'Printer name is required' });
    }

    // Enforce that only one printer can be default
    const makeDefault = Boolean(isDefault) || shop.printers.length === 0;
    if (makeDefault) {
      shop.printers.forEach((p) => {
        p.isDefault = false;
      });
    }

    shop.printers.push({
      name,
      colorSupport: Boolean(colorSupport),
      duplexSupport: duplexSupport !== undefined ? Boolean(duplexSupport) : true,
      paperSizes: Array.isArray(paperSizes) && paperSizes.length > 0 ? paperSizes : ['A4'],
      isDefault: makeDefault,
    });

    await shop.save();
    return res.status(201).json({
      success: true,
      message: 'Printer added successfully',
      printers: shop.printers,
    });
  } catch (err) {
    next(err);
  }
}

export async function updatePrinter(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { printerId } = req.params;
    const printer = shop.printers.id(printerId);

    if (!printer) {
      return res.status(404).json({ success: false, message: 'Printer not found' });
    }

    const { name, colorSupport, duplexSupport, paperSizes, isDefault } = req.body;
    if (name) printer.name = name;
    if (colorSupport !== undefined) printer.colorSupport = Boolean(colorSupport);
    if (duplexSupport !== undefined) printer.duplexSupport = Boolean(duplexSupport);
    if (paperSizes) printer.paperSizes = paperSizes;

    if (isDefault) {
      shop.printers.forEach((p) => {
        p.isDefault = p._id.toString() === printerId;
      });
    }

    await shop.save();
    return res.status(200).json({
      success: true,
      message: 'Printer updated successfully',
      printers: shop.printers,
    });
  } catch (err) {
    next(err);
  }
}

export async function deletePrinter(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { printerId } = req.params;

    shop.printers.pull({ _id: printerId });

    // If deleted printer was default and other printers exist, make the first one default
    if (shop.printers.length > 0 && !shop.printers.some((p) => p.isDefault)) {
      shop.printers[0].isDefault = true;
    }

    await shop.save();
    return res.status(200).json({
      success: true,
      message: 'Printer removed',
      printers: shop.printers,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * QR Code endpoints
 */
export async function getShopQr(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    let qrRecord = await ShopQrCode.findOne({ shop: shop._id });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const publicUrl = `${clientUrl}/s/${shop.slug}`;

    if (!qrRecord) {
      const pngDataUrl = await QRCode.toDataURL(publicUrl, {
        width: 400,
        margin: 2,
        color: { dark: '#0284c7', light: '#ffffff' },
      });
      qrRecord = await ShopQrCode.create({
        shop: shop._id,
        publicUrl,
        pngDataUrl,
      });
    }

    return res.status(200).json({
      success: true,
      publicUrl,
      pngDataUrl: qrRecord.pngDataUrl,
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadShopQr(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const publicUrl = `${clientUrl}/s/${shop.slug}`;

    const pngBuffer = await QRCode.toBuffer(publicUrl, {
      type: 'png',
      width: 600,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="easyprint-qr-${shop.slug}.png"`
    );
    return res.send(pngBuffer);
  } catch (err) {
    next(err);
  }
}

/**
 * Live Queue View: returns active orders in FIFO order (paidAt asc)
 */
export async function getOwnerQueue(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { status } = req.query;

    const query = { shop: shop._id };
    if (status) {
      query.status = status;
    } else {
      query.status = { $in: ['queued', 'printing'] };
    }

    const orders = await Order.find(query)
      .sort({ paidAt: 1, queueNumber: 1, createdAt: 1 })
      .lean();

    // Attach first file name and options summary for each order
    const populatedOrders = await Promise.all(
      orders.map(async (order) => {
        const files = await OrderFile.find({ order: order._id }).lean();
        const firstFile = files[0];
        const fileName = firstFile ? firstFile.originalName : 'Document';
        const fileCount = files.length;

        const opts = order.options || {};
        const optionsSummary = `${opts.colorMode === 'color' ? 'Color' : 'B&W'} • ${
          opts.sides === 'double' ? 'Duplex' : 'Single'
        } • ${opts.paperSize} • ${opts.copies || 1} copy`;

        return {
          id: order._id,
          orderNumber: order.orderNumber,
          queueNumber: order.queueNumber,
          queueDate: order.queueDate,
          customerPhone: order.customerPhone,
          firstFileName: fileName,
          fileCount,
          options: opts,
          optionsSummary,
          status: order.status,
          totalAmount: order.totalAmount,
          paidAt: order.paidAt,
          createdAt: order.createdAt,
          printingStartedAt: order.printingStartedAt,
        };
      })
    );

    return res.status(200).json({
      success: true,
      shop: {
        id: shop._id,
        name: shop.name,
        slug: shop.slug,
        isOnline: shop.isOnline,
        maxQueue: shop.maxQueue,
      },
      queueLength: populatedOrders.length,
      orders: populatedOrders,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Cancel an order and issue Razorpay refund if paid.
 * Rejects with 409 if order is already printing or completed.
 */
export async function cancelOrder(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { orderNumber } = req.params;

    const order = await Order.findOne({
      orderNumber: orderNumber.toUpperCase(),
      shop: shop._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order "${orderNumber}" not found for this shop.`,
      });
    }

    // Atomic guard: Cannot cancel if already printing or completed
    if (['printing', 'completed'].includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot cancel order "${orderNumber}" because it is currently ${order.status}.`,
      });
    }

    const printJob = await PrintJob.findOne({ order: order._id });
    if (printJob && ['printing', 'completed'].includes(printJob.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot cancel order "${orderNumber}" because print agent has already started printing.`,
      });
    }

    const wasQueued = order.status === 'queued';

    // Remove from BullMQ queue
    try {
      const bullQueue = getShopQueue(shop._id.toString());
      const job = await bullQueue.getJob(order._id.toString());
      if (job) {
        await job.remove();
      }
    } catch (bullErr) {
      console.warn(`[BullMQ] Warning removing job for order ${orderNumber}:`, bullErr.message);
    }

    // Cancel PrintJob if it exists
    if (printJob) {
      printJob.status = 'failed';
      printJob.errorMessage = 'Cancelled by shop owner';
      await printJob.save();
    }

    // If order was paid, attempt Razorpay refund
    let isRefunded = false;
    let refundPending = false;
    let refundId = null;

    if (order.paidAt || order.razorpayPaymentId) {
      const payment = await Payment.findOne({
        order: order._id,
        status: { $in: ['paid', 'created'] },
      });

      if (payment && (payment.razorpayPaymentId || order.razorpayPaymentId)) {
        const paymentId = payment.razorpayPaymentId || order.razorpayPaymentId;
        try {
          const rzp = getRazorpayClient();
          const refund = await rzp.payments.refund(paymentId, {
            amount: payment.amount,
            notes: {
              reason: 'Cancelled by shop owner',
              orderNumber: order.orderNumber,
            },
          });
          refundId = refund.id;
          isRefunded = true;

          payment.status = 'refunded';
          payment.refundId = refundId;
          await payment.save();
        } catch (refundErr) {
          console.error(`[Razorpay Refund Error] Order ${orderNumber}:`, refundErr.message);
          refundPending = true;
        }
      }
    }

    // Transition Order status
    if (isRefunded) {
      order.status = 'refunded';
    } else if (refundPending) {
      order.status = 'refund_pending';
    } else {
      order.status = 'cancelled';
    }
    await order.save();

    await recordOrderEvent(order._id, order.orderNumber, `status_${order.status}`, {
      refundId,
      cancelledBy: req.user._id,
    });

    // Decrement Redis queue counter if was queued
    if (wasQueued) {
      try {
        const redis = getRedisClient();
        await redis.decr(`shop:${shop._id}:active_count`);
      } catch (redisErr) {
        console.warn(`[Redis Decr Error] Shop ${shop._id}:`, redisErr.message);
      }
    }

    // Emit live Socket.IO events
    const io = req.app.get('io');
    if (io) {
      await emitQueueAndOrderStatus(shop._id.toString(), order, io);
    }

    return res.status(200).json({
      success: true,
      message: `Order "${orderNumber}" cancelled successfully.`,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
        refundId,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retry a failed print job.
 * Resets attemptCount: 0, sets status: 'queued', and re-enqueues to BullMQ.
 */
export async function retryOrder(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { orderNumber } = req.params;

    const order = await Order.findOne({
      orderNumber: orderNumber.toUpperCase(),
      shop: shop._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order "${orderNumber}" not found for this shop.`,
      });
    }

    let printJob = await PrintJob.findOne({ order: order._id });
    if (!printJob) {
      printJob = new PrintJob({
        order: order._id,
        shop: shop._id,
      });
    }

    // Reset attempt count and set status to queued
    printJob.attemptCount = 0;
    printJob.status = 'queued';
    printJob.errorMessage = null;
    printJob.leaseExpiresAt = null;
    await printJob.save();

    order.status = 'queued';
    await order.save();

    await recordOrderEvent(order._id, order.orderNumber, 'status_retry_queued', {
      retriedBy: req.user._id,
    });

    // Add back to BullMQ
    try {
      const bullQueue = getShopQueue(shop._id.toString());
      await bullQueue.add(
        'print',
        {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          shopId: shop._id.toString(),
        },
        {
          jobId: order._id.toString(),
        }
      );
    } catch (bullErr) {
      console.warn(`[BullMQ] Warning re-adding job for order ${orderNumber}:`, bullErr.message);
    }

    // Emit live Socket.IO updates
    const io = req.app.get('io');
    if (io) {
      await emitQueueAndOrderStatus(shop._id.toString(), order, io);
    }

    return res.status(200).json({
      success: true,
      message: `Order "${orderNumber}" re-queued for printing.`,
      order: {
        orderNumber: order.orderNumber,
        status: order.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Generate a new paired agent token for the shop's Windows background printing agent.
 * Plaintext token is returned only once and never stored unhashed.
 */
export async function createAgentToken(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { name } = req.body || {};

    const plaintextToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plaintextToken).digest('hex');

    const agentDevice = await AgentDevice.create({
      shop: shop._id,
      name: name || 'Shop Printer Agent',
      tokenHash,
      lastHeartbeatAt: new Date(),
      printerStatus: 'ready',
      isRevoked: false,
    });

    return res.status(201).json({
      success: true,
      message: 'Agent token generated successfully. Store this token securely; it cannot be retrieved again.',
      token: plaintextToken,
      agentDevice: {
        id: agentDevice._id,
        name: agentDevice.name,
        lastHeartbeatAt: agentDevice.lastHeartbeatAt,
        printerStatus: agentDevice.printerStatus,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get alerts for an owner shop.
 */
export async function getShopAlerts(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const alerts = await OwnerAlert.find({ shop: shop._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      success: true,
      alerts: alerts.map((a) => ({
        id: a._id,
        type: a.type,
        message: a.message,
        orderNumber: a.orderNumber,
        readAt: a.readAt,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark a shop alert as read.
 */
export async function markAlertAsRead(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { alertId } = req.params;

    const alert = await OwnerAlert.findOneAndUpdate(
      { _id: alertId, shop: shop._id },
      { $set: { readAt: new Date() } },
      { new: true }
    );

    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found for this shop.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Alert marked as read.',
      alert: {
        id: alert._id,
        readAt: alert.readAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get shop analytics (orders count, revenue, refunds, turnaround, failure rate, and daily chart series).
 */
export async function getShopAnalytics(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { from, to } = req.query;

    const toDate = to ? new Date(to) : new Date();
    if (!to) {
      toDate.setHours(23, 59, 59, 999);
    }
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!from) {
      fromDate.setHours(0, 0, 0, 0);
    }

    // Aggregation pipeline to compute summary stats
    const pipeline = [
      {
        $match: {
          shop: shop._id,
          createdAt: { $gte: fromDate, $lte: toDate },
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                revenue: {
                  $sum: {
                    $cond: [
                      { $in: ['$status', ['queued', 'claimed', 'printing', 'completed']] },
                      '$totalAmount',
                      0,
                    ],
                  },
                },
                refundsTotal: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'refunded'] }, '$totalAmount', 0],
                  },
                },
                completedCount: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
                  },
                },
                failedCount: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'failed'] }, 1, 0],
                  },
                },
                totalTurnaroundSeconds: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ['$status', 'completed'] },
                          { $ne: ['$paidAt', null] },
                          { $ne: ['$completedAt', null] },
                        ],
                      },
                      {
                        $divide: [{ $subtract: ['$completedAt', '$paidAt'] }, 1000],
                      },
                      0,
                    ],
                  },
                },
              },
            },
          ],
          dailySeries: [
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
                orders: { $sum: 1 },
                revenue: {
                  $sum: {
                    $cond: [
                      { $in: ['$status', ['queued', 'claimed', 'printing', 'completed']] },
                      '$totalAmount',
                      0,
                    ],
                  },
                },
                failed: {
                  $sum: {
                    $cond: [{ $eq: ['$status', 'failed'] }, 1, 0],
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ];

    const [result] = await Order.aggregate(pipeline);
    const summary = result?.summary?.[0] || {
      totalOrders: 0,
      revenue: 0,
      refundsTotal: 0,
      completedCount: 0,
      failedCount: 0,
      totalTurnaroundSeconds: 0,
    };

    const completed = summary.completedCount || 0;
    const failed = summary.failedCount || 0;
    const failureRate = completed + failed > 0 ? failed / (completed + failed) : 0;
    const avgTurnaround = completed > 0 ? Math.round(summary.totalTurnaroundSeconds / completed) : 0;

    const formatSeconds = (sec) => {
      if (!sec) return '0s';
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    const series = (result?.dailySeries || []).map((d) => ({
      date: d._id,
      orders: d.orders,
      revenue: d.revenue,
      failed: d.failed,
    }));

    return res.status(200).json({
      success: true,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      totalOrders: summary.totalOrders || 0,
      revenue: summary.revenue || 0,
      refundsTotal: summary.refundsTotal || 0,
      averageTurnaroundSeconds: avgTurnaround,
      averageTurnaroundFormatted: formatSeconds(avgTurnaround),
      failureRate: Math.round(failureRate * 1000) / 1000,
      dailySeries: series,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Helper to escape CSV injection vectors: =, +, -, @
 */
function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export shop orders as CSV with CSV-injection protection.
 */
export async function exportOrdersCsv(req, res, next) {
  try {
    const shop = await getOwnerShopOr404(req.params.id, req.user._id);
    const { from, to } = req.query;

    const query = { shop: shop._id };
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) {
        const toD = new Date(to);
        toD.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toD;
      }
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).lean();

    const headers = [
      'orderNumber',
      'paidAt',
      'status',
      'pages',
      'copies',
      'colorMode',
      'sides',
      'totalAmount',
      'refundedAmount',
    ];

    const rows = [headers.join(',')];

    for (const o of orders) {
      const isRefunded = o.status === 'refunded';
      const refundedAmount = isRefunded ? o.totalAmount : 0;
      const pages = o.breakdown?.effectivePages || 1;
      const copies = o.options?.copies || 1;
      const colorMode = o.options?.colorMode || 'bw';
      const sides = o.options?.sides || 'single';

      const row = [
        sanitizeCsvCell(o.orderNumber),
        sanitizeCsvCell(o.paidAt ? new Date(o.paidAt).toISOString() : ''),
        sanitizeCsvCell(o.status),
        sanitizeCsvCell(pages),
        sanitizeCsvCell(copies),
        sanitizeCsvCell(colorMode),
        sanitizeCsvCell(sides),
        sanitizeCsvCell(o.totalAmount),
        sanitizeCsvCell(refundedAmount),
      ];
      rows.push(row.join(','));
    }

    const csvData = rows.join('\r\n');
    const filename = `orders-${shop.slug}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvData);
  } catch (err) {
    next(err);
  }
}

