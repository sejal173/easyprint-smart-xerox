import mongoose from 'mongoose';
import {
  ORDER_STATUS,
  COLOR_MODE,
  SIDES,
  PAPER_SIZE,
  PAPER_QUALITY,
  ORIENTATION,
  PAGE_SELECTION,
  ODD_EVEN,
  PAGES_PER_SHEET,
} from '@easyprint/shared';

const orderOptionsSchema = new mongoose.Schema(
  {
    pageSelection: {
      type: String,
      enum: Object.values(PAGE_SELECTION),
      default: PAGE_SELECTION.ALL,
    },
    customRange: {
      type: String,
      default: '',
      trim: true,
    },
    colorMode: {
      type: String,
      enum: Object.values(COLOR_MODE),
      default: COLOR_MODE.BW,
    },
    sides: {
      type: String,
      enum: Object.values(SIDES),
      default: SIDES.SINGLE,
    },
    paperSize: {
      type: String,
      enum: Object.values(PAPER_SIZE),
      default: PAPER_SIZE.A4,
    },
    paperQuality: {
      type: String,
      enum: Object.values(PAPER_QUALITY),
      default: PAPER_QUALITY.NORMAL,
    },
    orientation: {
      type: String,
      enum: Object.values(ORIENTATION),
      default: ORIENTATION.PORTRAIT,
    },
    copies: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    oddEven: {
      type: String,
      enum: Object.values(ODD_EVEN),
      default: ODD_EVEN.ALL,
    },
    pagesPerSheet: {
      type: Number,
      enum: PAGES_PER_SHEET,
      default: 1,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: [true, 'Order number is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop reference is required'],
      index: true,
    },
    customerPhone: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.DRAFT,
      index: true,
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: 0,
    },
    breakdown: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    options: {
      type: orderOptionsSchema,
      required: true,
      default: () => ({}),
    },
    queueNumber: {
      type: Number,
      default: null,
    },
    queueDate: {
      type: String,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    printingStartedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    sheetCount: {
      type: Number,
      default: 0,
    },
    printDurationSeconds: {
      type: Number,
      default: 0,
    },
    razorpayOrderId: {
      type: String,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Required compound index for fast live queue lookups
orderSchema.index({ shop: 1, status: 1, paidAt: 1 });

// Unique partial index for razorpayPaymentId (allows nulls)
orderSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } }
);

export const Order = mongoose.model('Order', orderSchema);
export default Order;
