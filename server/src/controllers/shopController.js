import QRCode from 'qrcode';
import { Shop } from '../models/Shop.js';
import { ShopQrCode } from '../models/ShopQrCode.js';
import { Order } from '../models/Order.js';
import { AgentDevice } from '../models/AgentDevice.js';
import { calculateCustomerWaitTime } from '@easyprint/shared';

/**
 * Get shop details by slug, including queue length, waiting time, and QR code.
 */
export async function getShopBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const shop = await Shop.findOne({ slug: slug.toLowerCase() }).lean();

    if (!shop || shop.status === 'suspended') {
      return res.status(404).json({
        success: false,
        message: `Shop with slug "${slug}" not found.`,
      });
    }

    // Active orders in queue
    const queuedOrders = await Order.find({
      shop: shop._id,
      status: 'queued',
    })
      .select('options breakdown paidAt queueNumber')
      .sort({ paidAt: 1, queueNumber: 1, createdAt: 1 })
      .lean();

    const printingOrder = await Order.findOne({
      shop: shop._id,
      status: 'printing',
    })
      .select('options breakdown printingStartedAt')
      .lean();

    // Map order fields for ETA calculation
    const formattedQueued = queuedOrders.map((o) => ({
      effectivePages: o.breakdown?.effectivePages || 1,
      copies: o.options?.copies || 1,
      pagesPerSheet: o.options?.pagesPerSheet || 1,
      sides: o.options?.sides || 'single',
    }));

    const formattedPrinting = printingOrder
      ? {
        effectivePages: printingOrder.breakdown?.effectivePages || 1,
        copies: printingOrder.options?.copies || 1,
        pagesPerSheet: printingOrder.options?.pagesPerSheet || 1,
        sides: printingOrder.options?.sides || 'single',
        printingStartedAt: printingOrder.printingStartedAt,
      }
      : null;

    const waitStats = calculateCustomerWaitTime({
      queuedOrders: formattedQueued,
      currentlyPrintingOrder: formattedPrinting,
    });

    // Check paired printing agent heartbeat
    const pairedAgent = await AgentDevice.findOne({
      shop: shop._id,
      isRevoked: false,
    }).sort({ lastHeartbeatAt: -1 });

    const now = Date.now();
    const isAgentHeartbeatFresh =
      pairedAgent &&
      pairedAgent.printerStatus === 'ready' &&
      now - new Date(pairedAgent.lastHeartbeatAt).getTime() <= 90 * 1000;

    // Determine availability state
    let availability = 'ONLINE';
    if (!shop.isOnline || shop.status !== 'active') {
      availability = 'OFFLINE';
    } else if (pairedAgent && !isAgentHeartbeatFresh) {
      // If shop has paired agent but heartbeat > 90s or printer error, mark OFFLINE
      availability = 'OFFLINE';
    } else if (waitStats.queueLength >= 10) {
      availability = 'BUSY';
    }

    // Fetch or generate QR code
    let qrRecord = await ShopQrCode.findOne({ shop: shop._id }).lean();
    if (!qrRecord) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const publicUrl = `${clientUrl}/s/${shop.slug}`;
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

    return res.json({
      success: true,
      shop: {
        id: shop._id,
        name: shop.name,
        slug: shop.slug,
        address: shop.address,
        phone: shop.phone,
        email: shop.email,
        isOnline: shop.isOnline,
        status: shop.status,
        availability,
        priceSettings: shop.priceSettings,
        maxQueue: shop.maxQueue,
        queueLength: waitStats.queueLength,
        estimatedWaitTime: waitStats.formatted,
        totalWaitSeconds: waitStats.totalWaitSeconds,
        estimatedWaitSeconds: waitStats.totalWaitSeconds,
        qrCode: {
          publicUrl: qrRecord.publicUrl,
          dataUrl: qrRecord.pngDataUrl,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Download or stream shop QR code as PNG image.
 */
export async function getShopQrCodeImage(req, res, next) {
  try {
    const { slug } = req.params;
    const shop = await Shop.findOne({ slug: slug.toLowerCase() }).lean();

    if (!shop || shop.status === 'suspended') {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

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

