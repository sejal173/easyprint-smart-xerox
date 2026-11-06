import {
  COLOR_MODE,
  SIDES,
  PAPER_SIZE,
  PAPER_QUALITY,
  PAGE_SELECTION,
  ODD_EVEN,
  DEFAULT_PRICE_SETTINGS,
} from './constants.js';

/**
 * Parses a page range string like "1-3, 5, 7-9" given a total page count.
 * Returns an array of valid 1-based page numbers.
 *
 * @param {string} rangeStr
 * @param {number} maxPages
 * @returns {number[]} sorted unique page numbers
 */
export function parsePageRange(rangeStr, maxPages = 1) {
  if (!rangeStr || typeof rangeStr !== 'string') {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }

  const pages = new Set();
  const tokens = rangeStr.split(',').map((t) => t.trim()).filter(Boolean);

  for (const token of tokens) {
    if (token.includes('-')) {
      const parts = token.split('-').map((p) => parseInt(p.trim(), 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const start = Math.max(1, Math.min(parts[0], parts[1]));
        const end = Math.min(maxPages, Math.max(parts[0], parts[1]));
        for (let i = start; i <= end; i++) {
          pages.add(i);
        }
      }
    } else {
      const pageNum = parseInt(token, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPages) {
        pages.add(pageNum);
      }
    }
  }

  const result = Array.from(pages).sort((a, b) => a - b);
  return result.length > 0 ? result : Array.from({ length: maxPages }, (_, i) => i + 1);
}

/**
 * Filters page numbers according to odd/even filter.
 *
 * @param {number[]} pages
 * @param {string} oddEven - 'all' | 'odd' | 'even'
 * @returns {number[]}
 */
export function filterOddEven(pages, oddEven = ODD_EVEN.ALL) {
  if (oddEven === ODD_EVEN.ODD) {
    return pages.filter((p) => p % 2 !== 0);
  }
  if (oddEven === ODD_EVEN.EVEN) {
    return pages.filter((p) => p % 2 === 0);
  }
  return pages;
}

/**
 * Resolves effective selected page count across files based on options.
 *
 * @param {Array<{ pageCount: number }>} files
 * @param {Object} options
 * @returns {number}
 */
export function calculateEffectivePages(files, options) {
  if (!files || files.length === 0) return 0;

  const {
    pageSelection = PAGE_SELECTION.ALL,
    customRange = '',
    oddEven = ODD_EVEN.ALL,
  } = options || {};

  let totalSelectedPages = 0;

  for (const file of files) {
    const maxPages = Math.max(1, Number(file.pageCount) || 1);
    let selected;

    if (pageSelection === PAGE_SELECTION.CUSTOM && customRange.trim()) {
      selected = parsePageRange(customRange, maxPages);
    } else {
      selected = Array.from({ length: maxPages }, (_, i) => i + 1);
    }

    selected = filterOddEven(selected, oddEven);
    totalSelectedPages += selected.length;
  }

  return totalSelectedPages;
}

/**
 * Computes physical sheet count for a document given effective pages,
 * pagesPerSheet, sides, and copies.
 *
 * @param {Object} params
 * @param {number} params.effectivePages
 * @param {number} [params.pagesPerSheet=1]
 * @param {string} [params.sides='single']
 * @param {number} [params.copies=1]
 * @returns {{ sheetsPerCopy: number, totalSheets: number, duplexSheetsPerCopy: number }}
 */
export function calculatePhysicalSheets({
  effectivePages = 1,
  pagesPerSheet = 1,
  sides = SIDES.SINGLE,
  copies = 1,
} = {}) {
  const pps = Number(pagesPerSheet) || 1;
  const numCopies = Math.max(1, parseInt(copies, 10) || 1);
  const pages = Math.max(0, Number(effectivePages) || 0);

  if (pages === 0) {
    return { sheetsPerCopy: 0, totalSheets: 0, duplexSheetsPerCopy: 0 };
  }

  let sheetsPerCopy = 0;
  let duplexSheetsPerCopy = 0;

  if (sides === SIDES.SINGLE) {
    sheetsPerCopy = Math.ceil(pages / pps);
    duplexSheetsPerCopy = 0;
  } else {
    const logicalPagesPerSheet = pps * 2;
    sheetsPerCopy = Math.ceil(pages / logicalPagesPerSheet);
    duplexSheetsPerCopy = Math.floor(pages / logicalPagesPerSheet);
    const remainder = pages % logicalPagesPerSheet;
    if (remainder > pps) {
      duplexSheetsPerCopy += 1;
    }
  }

  return {
    sheetsPerCopy,
    totalSheets: sheetsPerCopy * numCopies,
    duplexSheetsPerCopy,
  };
}

/**
 * Calculates print quote with complete itemized breakdown.
 *
 * @param {Object} params
 * @param {Array<{ pageCount: number }>} params.files
 * @param {Object} params.options
 * @param {Object} [params.priceSettings]
 * @returns {Object} { totalAmount, breakdown }
 */
export function calculatePrintPrice({ files = [], options = {}, priceSettings = {} }) {
  const mergedSettings = { ...DEFAULT_PRICE_SETTINGS, ...priceSettings };

  const colorMode = options.colorMode || COLOR_MODE.BW;
  const sides = options.sides || SIDES.SINGLE;
  const paperSize = options.paperSize || PAPER_SIZE.A4;
  const paperQuality = options.paperQuality || PAPER_QUALITY.NORMAL;
  const pagesPerSheet = Number(options.pagesPerSheet) || 1;
  const copies = Math.max(1, parseInt(options.copies, 10) || 1);

  const effectivePagesPerCopy = calculateEffectivePages(files, options);

  if (effectivePagesPerCopy === 0) {
    return {
      totalAmount: 0,
      breakdown: {
        effectivePages: 0,
        sheetsPerCopy: 0,
        totalSheets: 0,
        copies,
        baseRate: 0,
        baseCost: 0,
        paperSizeMultiplier: 1,
        duplexDiscountPerCopy: 0,
        duplexDiscountTotal: 0,
        paperQualitySurchargePerCopy: 0,
        paperQualitySurchargeTotal: 0,
        costPerCopy: 0,
        totalAmount: 0,
      },
    };
  }

  // Calculate physical sheets required per copy
  const { sheetsPerCopy, duplexSheetsPerCopy, totalSheets } = calculatePhysicalSheets({
    effectivePages: effectivePagesPerCopy,
    pagesPerSheet,
    sides,
    copies,
  });

  // Base rate per page
  const isColor = colorMode === COLOR_MODE.COLOR;
  const baseRate = isColor ? Number(mergedSettings.colorPerPage) : Number(mergedSettings.bwPerPage);

  // Paper size multiplier (e.g. A3 is 2x rate of A4)
  const isA3 = paperSize === PAPER_SIZE.A3;
  const paperSizeMultiplier = isA3 ? Number(mergedSettings.a3Multiplier || 2.0) : 1.0;

  // Adjusted base cost for printing pages
  const baseCostPerCopy = effectivePagesPerCopy * baseRate * paperSizeMultiplier;

  // Duplex discount per copy
  const duplexDiscountPerSheet = Number(mergedSettings.duplexDiscount) || 0;
  const duplexDiscountPerCopy = duplexSheetsPerCopy * duplexDiscountPerSheet;
  const duplexDiscountTotal = duplexDiscountPerCopy * copies;

  // Paper quality surcharge (e.g. Glossy paper surcharge per physical sheet)
  const isGlossy = paperQuality === PAPER_QUALITY.GLOSSY;
  const glossySurchargePerSheet = isGlossy
    ? (Number(mergedSettings.glossyPaperSurcharge) || 5.0) * paperSizeMultiplier
    : 0;
  const paperQualitySurchargePerCopy = sheetsPerCopy * glossySurchargePerSheet;
  const paperQualitySurchargeTotal = paperQualitySurchargePerCopy * copies;

  // Final per copy and total amount calculation
  const subtotalPerCopy = baseCostPerCopy - duplexDiscountPerCopy + paperQualitySurchargePerCopy;
  const finalCostPerCopy = Math.max(0.5, subtotalPerCopy);
  const rawTotal = finalCostPerCopy * copies;
  const totalAmount = Math.round(rawTotal * 100) / 100;

  return {
    totalAmount,
    breakdown: {
      effectivePages: effectivePagesPerCopy,
      sheetsPerCopy,
      totalSheets,
      copies,
      colorMode,
      baseRate,
      paperSizeMultiplier,
      paperSize,
      sides,
      duplexSheetsPerCopy,
      duplexDiscountPerCopy: Math.round(duplexDiscountPerCopy * 100) / 100,
      duplexDiscountTotal: Math.round(duplexDiscountTotal * 100) / 100,
      paperQuality,
      paperQualitySurchargePerCopy: Math.round(paperQualitySurchargePerCopy * 100) / 100,
      paperQualitySurchargeTotal: Math.round(paperQualitySurchargeTotal * 100) / 100,
      costPerCopy: Math.round(finalCostPerCopy * 100) / 100,
      totalAmount,
    },
  };
}

