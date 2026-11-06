import mongoose from 'mongoose';

const shopQrCodeSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop reference is required'],
      unique: true,
      index: true,
    },
    publicUrl: {
      type: String,
      required: [true, 'Public URL is required'],
    },
    pngDataUrl: {
      type: String,
      default: '',
    },
    storageKey: {
      type: String,
      default: '',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const ShopQrCode = mongoose.model('ShopQrCode', shopQrCodeSchema);
export default ShopQrCode;

