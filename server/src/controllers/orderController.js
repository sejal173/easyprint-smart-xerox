import { Shop } from '../models/Shop.js';
import { Order } from '../models/Order.js';
import { OrderFile } from '../models/OrderFile.js';
import { stagedFilesStore } from './uploadController.js';
import { generateOrderNumber } from '../utils/orderNumberGenerator.js';
import { calculatePrintPrice, DEFAULT_PRICE_SETTINGS, ORDER_STATUS } from '@easyprint/shared';
import { recordOrderEvent } from '../services/orderEventService.js';
import { z } from 'zod';

const draftOrderSchema = z.object({
  shopSlug: z.string().min(1, 'Shop slug is required'),
  customerPhone: z.string().optional().default(''),
  fileIds: z.array(z.string()).min(1, 'At least one uploaded file is required'),
  options: z.object({
    pageSelection: z.enum(['all', 'custom']).default('all'),
    customRange: z.string().default(''),
    colorMode: z.enum(['bw', 'color']).default('bw'),
    sides: z.enum(['single', 'double']).default('single'),
    paperSize: z.enum(['A4', 'A3']).default('A4'),
    paperQuality: z.enum(['normal', 'glossy']).default('normal'),
    orientation: z.enum(['portrait', 'landscape']).default('portrait'),
    copies: z.number().int().min(1).default(1),
    oddEven: z.enum(['all', 'odd', 'even']).default('all'),
    pagesPerSheet: z.number().int().refine((val) => [1, 2, 4].includes(val)).default(1),
  }),
});

/**
 * Creates a draft order with a unique order number.
 * Recalculates verified price and links uploaded files.
 */
export async function createDraftOrder(req, res, next) {
  try {
    const parseResult = draftOrderSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order input data',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { shopSlug, customerPhone, fileIds, options } = parseResult.data;

    const shop = await Shop.findOne({ slug: shopSlug.toLowerCase() });
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: `Shop "${shopSlug}" not found.`,
      });
    }

    if (shop.status === 'suspended') {
      return res.status(400).json({
        success: false,
        message: 'This shop is currently suspended and cannot accept orders.',
      });
    }

    if (!shop.isOnline) {
      return res.status(400).json({
        success: false,
        message: 'This shop is currently offline and not accepting orders.',
      });
    }

    // Retrieve file records from staged store
    const attachedFiles = [];
    for (const fileId of fileIds) {
      const staged = stagedFilesStore.get(fileId);
      if (staged) {
        attachedFiles.push(staged);
      }
    }

    if (attachedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Uploaded file session has expired or no valid files found. Please re-upload your files.',
      });
    }

    // Server-side authoritative price recalculation
    const priceSettings = shop.priceSettings || DEFAULT_PRICE_SETTINGS;
    const priceResult = calculatePrintPrice({
      files: attachedFiles,
      options,
      priceSettings,
    });

    // Generate human-readable order number (e.g. EP-261106-0001)
    const orderNumber = await generateOrderNumber();

    // Create Draft Order in MongoDB
    const order = await Order.create({
      orderNumber,
      shop: shop._id,
      customerPhone,
      status: ORDER_STATUS.DRAFT,
      totalAmount: priceResult.totalAmount,
      breakdown: priceResult.breakdown,
      options,
    });

    await recordOrderEvent(order._id, order.orderNumber, 'status_draft', {
      totalAmount: order.totalAmount,
      customerPhone,
    });

    // Create OrderFile records linked to this order
    const orderFiles = [];
    for (const file of attachedFiles) {
      const orderFile = await OrderFile.create({
        order: order._id,
        storageKey: file.storageKey,
        originalName: file.originalName,
        mimeType: file.mimeType,
        pageCount: file.pageCount,
        sizeBytes: file.sizeBytes,
        previewUrl: file.previewUrl || '',
      });
      orderFiles.push(orderFile);
    }

    return res.status(201).json({
      success: true,
      message: 'Draft order created successfully',
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.totalAmount,
        breakdown: order.breakdown,
        options: order.options,
        files: orderFiles.map((f) => ({
          id: f._id,
          originalName: f.originalName,
          pageCount: f.pageCount,
          sizeBytes: f.sizeBytes,
          previewUrl: f.previewUrl,
        })),
        shop: {
          name: shop.name,
          slug: shop.slug,
          address: shop.address,
        },
        createdAt: order.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get order details by orderNumber.
 */
export async function getOrderByNumber(req, res, next) {
  try {
    const { orderNumber } = req.params;
    const order = await Order.findOne({ orderNumber: orderNumber.toUpperCase() })
      .populate('shop', 'name slug address phone isOnline status')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: `Order "${orderNumber}" not found.`,
      });
    }

    const files = await OrderFile.find({ order: order._id }).lean();

    return res.json({
      success: true,
      order: {
        ...order,
        files,
      },
    });
  } catch (err) {
    next(err);
  }
}

