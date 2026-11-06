import { z } from 'zod';
import { Shop, Order, Payment, User, OrderEvent, AdminAction } from '../models/index.js';

const shopStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

const updateUserSchema = z.object({
  role: z.enum(['owner', 'admin']).optional(),
  isSuspended: z.boolean().optional(),
});

/**
 * List all shops with optional status/search filters.
 */
export async function getAdminShops(req, res, next) {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (status && ['active', 'suspended'].includes(status)) {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [shops, total] = await Promise.all([
      Shop.find(filter)
        .populate('owner', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Shop.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      shops: shops.map((s) => ({
        id: s._id,
        name: s.name,
        slug: s.slug,
        owner: s.owner,
        isOnline: s.isOnline,
        status: s.status,
        printerCount: s.printers?.length || 0,
        createdAt: s.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update shop status (active | suspended).
 * Suspended shops are hidden from customers and cannot accept orders.
 */
export async function updateAdminShopStatus(req, res, next) {
  try {
    const parseResult = shopStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active" or "suspended".',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { status } = parseResult.data;
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    const previousStatus = shop.status;
    shop.status = status;
    await shop.save();

    // Write immutable AdminAction audit record
    await AdminAction.create({
      adminId: req.user._id,
      action: status === 'suspended' ? 'suspend_shop' : 'activate_shop',
      targetType: 'shop',
      targetId: shop._id.toString(),
      before: { status: previousStatus },
      after: { status },
    });

    // Notify room if Socket.IO is initialized
    const io = req.app.get('io');
    if (io) {
      io.to(`shop:${shop._id}`).emit('shop.status', {
        shopId: shop._id.toString(),
        isOnline: status === 'active' ? shop.isOnline : false,
        status,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Shop status updated to "${status}".`,
      shop: {
        id: shop._id,
        name: shop.name,
        status: shop.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List platform orders with filters for shop, status, and date range.
 */
export async function getAdminOrders(req, res, next) {
  try {
    const { shop, status, from, to, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (shop) filter.shop = shop;
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const toD = new Date(to);
        toD.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toD;
      }
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('shop', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Order.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      orders: orders.map((o) => ({
        id: o._id,
        orderNumber: o.orderNumber,
        shop: o.shop,
        status: o.status,
        totalAmount: o.totalAmount,
        queueNumber: o.queueNumber,
        paidAt: o.paidAt,
        completedAt: o.completedAt,
        createdAt: o.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get detailed order information along with its chronological event timeline.
 */
export async function getAdminOrderByNumber(req, res, next) {
  try {
    const { orderNumber } = req.params;
    const order = await Order.findOne({ orderNumber: orderNumber.toUpperCase() })
      .populate('shop', 'name slug address phone')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order "${orderNumber}" not found.`,
      });
    }

    // Retrieve full event timeline from OrderEvent collection
    const timeline = await OrderEvent.find({ orderNumber: order.orderNumber })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      order,
      timeline: timeline.map((ev) => ({
        id: ev._id,
        type: ev.type,
        data: ev.data,
        createdAt: ev.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List payments with filters and platform revenue overview.
 */
export async function getAdminPayments(req, res, next) {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [payments, total, revenueAgg] = await Promise.all([
      Payment.find(filter)
        .populate({
          path: 'order',
          select: 'orderNumber shop totalAmount status',
          populate: { path: 'shop', select: 'name slug' },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Payment.countDocuments(filter),
      // Aggregate total paid, refunded, and net revenue across the whole platform
      Payment.aggregate([
        {
          $group: {
            _id: null,
            totalPaid: {
              $sum: {
                $cond: [{ $in: ['$status', ['paid', 'created']] }, '$amount', 0],
              },
            },
            totalRefunded: {
              $sum: {
                $cond: [{ $eq: ['$status', 'refunded'] }, '$amount', 0],
              },
            },
          },
        },
      ]),
    ]);

    const agg = revenueAgg[0] || { totalPaid: 0, totalRefunded: 0 };
    const paidPaise = agg.totalPaid || 0;
    const refundedPaise = agg.totalRefunded || 0;
    const netRevenuePaise = Math.max(0, paidPaise - refundedPaise);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      revenue: {
        paidPaise,
        paidRupees: paidPaise / 100,
        refundedPaise,
        refundedRupees: refundedPaise / 100,
        netRevenuePaise,
        netRevenueRupees: netRevenuePaise / 100,
      },
      payments: payments.map((p) => ({
        id: p._id,
        order: p.order,
        razorpayOrderId: p.razorpayOrderId,
        razorpayPaymentId: p.razorpayPaymentId,
        amount: p.amount,
        amountRupees: p.amount / 100,
        currency: p.currency,
        status: p.status,
        refundId: p.refundId,
        createdAt: p.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List platform users.
 */
export async function getAdminUsers(req, res, next) {
  try {
    const { role, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (role && ['owner', 'admin'].includes(role)) {
      filter.role = role;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [users, total] = await Promise.all([
      User.find(filter).select('-passwordHash').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        isSuspended: Boolean(u.isSuspended),
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update user role or suspension status.
 * An admin cannot demote or suspend themselves.
 */
export async function updateAdminUser(req, res, next) {
  try {
    const { id } = req.params;

    // Check self-modification guard
    if (req.user._id.toString() === id) {
      return res.status(400).json({
        success: false,
        message: 'Admins cannot modify their own privileges or suspension status.',
      });
    }

    const parseResult = updateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user update parameters',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { role, isSuspended } = parseResult.data;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const before = {
      role: user.role,
      isSuspended: Boolean(user.isSuspended),
    };

    if (role !== undefined) user.role = role;
    if (isSuspended !== undefined) user.isSuspended = isSuspended;

    await user.save();

    // Write AdminAction audit log
    await AdminAction.create({
      adminId: req.user._id,
      action: 'update_user',
      targetType: 'user',
      targetId: user._id.toString(),
      before,
      after: {
        role: user.role,
        isSuspended: Boolean(user.isSuspended),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isSuspended: user.isSuspended,
      },
    });
  } catch (err) {
    next(err);
  }
}

