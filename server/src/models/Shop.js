import mongoose from 'mongoose';
import { DEFAULT_PRICE_SETTINGS } from '@easyprint/shared';

const printerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    colorSupport: {
      type: Boolean,
      default: false,
    },
    duplexSupport: {
      type: Boolean,
      default: true,
    },
    paperSizes: {
      type: [String],
      default: ['A4'],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

const priceSettingsSchema = new mongoose.Schema(
  {
    bwPerPage: {
      type: Number,
      required: true,
      default: DEFAULT_PRICE_SETTINGS.bwPerPage,
    },
    colorPerPage: {
      type: Number,
      required: true,
      default: DEFAULT_PRICE_SETTINGS.colorPerPage,
    },
    duplexDiscount: {
      type: Number,
      required: true,
      default: DEFAULT_PRICE_SETTINGS.duplexDiscount,
    },
    a3Multiplier: {
      type: Number,
      required: true,
      default: DEFAULT_PRICE_SETTINGS.a3Multiplier,
    },
    glossyPaperSurcharge: {
      type: Number,
      required: true,
      default: DEFAULT_PRICE_SETTINGS.glossyPaperSurcharge,
    },
  },
  { _id: false }
);

const shopSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Shop owner is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Shop name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Shop slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    address: {
      type: String,
      required: [true, 'Shop address is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Shop phone number is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Shop email is required'],
      lowercase: true,
      trim: true,
    },
    location: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 },
    },
    isOnline: {
      type: Boolean,
      default: true,
      index: true,
    },
    isApproved: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
      index: true,
    },
    priceSettings: {
      type: priceSettingsSchema,
      default: () => ({ ...DEFAULT_PRICE_SETTINGS }),
    },
    maxQueue: {
      type: Number,
      default: 100,
    },
    printers: {
      type: [printerSchema],
      default: [],
    },
    openingHours: {
      type: [
        {
          day: { type: String, required: true },
          open: { type: String, default: '09:00' },
          close: { type: String, default: '21:00' },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const Shop = mongoose.model('Shop', shopSchema);
export default Shop;

