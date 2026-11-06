import { markOrderPaid } from '../services/orderQueueService.js';

/**
 * Dev-only endpoint to mark an order as paid without Razorpay.
 */
export async function devMarkOrderPaid(req, res, next) {
  try {
    if (process.env.RAZORPAY_KEY_ID && process.env.NODE_ENV !== 'test') {
      return res.status(403).json({
        success: false,
        message: 'Dev mark-paid endpoint is disabled when RAZORPAY_KEY_ID is configured.',
      });
    }

    console.warn('[SECURITY WARNING] Dev mark-paid endpoint invoked without payment gateway.');

    const { orderNumber } = req.params;
    const customDate = req.body?.customDate || req.query?.customDate;
    const io = req.app.get('io');

    const { order, isAlreadyQueued } = await markOrderPaid(orderNumber, io, { customDate });

    return res.status(200).json({
      success: true,
      message: isAlreadyQueued
        ? `Order ${orderNumber} was already queued.`
        : `Order ${orderNumber} successfully marked as paid and enqueued.`,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        queueNumber: order.queueNumber,
        queueDate: order.queueDate,
        paidAt: order.paidAt,
        totalAmount: order.totalAmount,
      },
    });
  } catch (err) {
    next(err);
  }
}
