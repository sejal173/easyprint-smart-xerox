import mongoose from 'mongoose';

const orderFileSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required'],
      index: true,
    },
    storageKey: {
      type: String,
      required: [true, 'Storage key is required'],
    },
    originalName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
    },
    pageCount: {
      type: Number,
      required: [true, 'Page count is required'],
      min: 1,
    },
    sizeBytes: {
      type: Number,
      required: [true, 'File size in bytes is required'],
    },
    previewUrl: {
      type: String,
      default: '',
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
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

export const OrderFile = mongoose.model('OrderFile', orderFileSchema);
export default OrderFile;

