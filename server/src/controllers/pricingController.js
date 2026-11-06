import { Shop } from '../models/Shop.js';
import { calculatePrintPrice, DEFAULT_PRICE_SETTINGS } from '@easyprint/shared';
import { z } from 'zod';

const quoteSchema = z.object({
  shopSlug: z.string().min(1, 'Shop slug is required'),
  files: z
    .array(
      z.object({
        pageCount: z.number().int().min(1).default(1),
      })
    )
    .min(1, 'At least one file must be provided'),
  options: z
    .object({
      pageSelection: z.enum(['all', 'custom']).optional(),
      customRange: z.string().optional(),
      colorMode: z.enum(['bw', 'color']).optional(),
      sides: z.enum(['single', 'double']).optional(),
      paperSize: z.enum(['A4', 'A3']).optional(),
      paperQuality: z.enum(['normal', 'glossy']).optional(),
      orientation: z.enum(['portrait', 'landscape']).optional(),
      copies: z.number().int().min(1).default(1),
      oddEven: z.enum(['all', 'odd', 'even']).optional(),
      pagesPerSheet: z.number().int().refine((val) => [1, 2, 4].includes(val)).default(1),
    })
    .default({}),
});

/**
 * Recalculate official price quote for requested options.
 * The server recalculates every total. Never trust client prices.
 */
export async function calculateQuote(req, res, next) {
  try {
    const parseResult = quoteSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request data',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { shopSlug, files, options } = parseResult.data;

    const shop = await Shop.findOne({ slug: shopSlug.toLowerCase() }).lean();
    if (!shop) {
      return res.status(404).json({
        success: false,
        message: `Shop "${shopSlug}" not found.`,
      });
    }

    const priceSettings = shop.priceSettings || DEFAULT_PRICE_SETTINGS;
    const quote = calculatePrintPrice({
      files,
      options,
      priceSettings,
    });

    return res.status(200).json({
      success: true,
      totalAmount: quote.totalAmount,
      breakdown: quote.breakdown,
    });
  } catch (err) {
    next(err);
  }
}

