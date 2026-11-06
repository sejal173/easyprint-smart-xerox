export const ORDER_STATUS = {
  DRAFT: 'draft',
  PENDING_PAYMENT: 'pending_payment',
  QUEUED: 'queued',
  PRINTING: 'printing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
  REFUND_PENDING: 'refund_pending',
};

export const PRINT_JOB_STATUS = {
  QUEUED: 'queued',
  CLAIMED: 'claimed',
  PRINTING: 'printing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const ALLOWED_JOB_TRANSITIONS = {
  queued: ['claimed', 'cancelled'],
  claimed: ['printing', 'queued', 'failed', 'cancelled'],
  printing: ['completed', 'failed'],
  completed: [],
  failed: ['queued'],
};

export const COLOR_MODE = {
  BW: 'bw',
  COLOR: 'color',
};

export const SIDES = {
  SINGLE: 'single',
  DOUBLE: 'double',
};

export const PAPER_SIZE = {
  A4: 'A4',
  A3: 'A3',
};

export const PAPER_QUALITY = {
  NORMAL: 'normal',
  GLOSSY: 'glossy',
};

export const ORIENTATION = {
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
};

export const PAGE_SELECTION = {
  ALL: 'all',
  CUSTOM: 'custom',
};

export const ODD_EVEN = {
  ALL: 'all',
  ODD: 'odd',
  EVEN: 'even',
};

export const PAGES_PER_SHEET = [1, 2, 4];

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_FILE_SIZE_MB = 20;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

export const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

export const DEFAULT_PRICE_SETTINGS = {
  bwPerPage: 2.0,
  colorPerPage: 10.0,
  duplexDiscount: 0.5,
  a3Multiplier: 2.0,
  glossyPaperSurcharge: 5.0,
};

export const DEFAULT_ORDER_OPTIONS = {
  pageSelection: PAGE_SELECTION.ALL,
  customRange: '',
  colorMode: COLOR_MODE.BW,
  sides: SIDES.SINGLE,
  paperSize: PAPER_SIZE.A4,
  paperQuality: PAPER_QUALITY.NORMAL,
  orientation: ORIENTATION.PORTRAIT,
  copies: 1,
  oddEven: ODD_EVEN.ALL,
  pagesPerSheet: 1,
};

