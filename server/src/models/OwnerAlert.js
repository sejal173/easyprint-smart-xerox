import mongoose from 'mongoose';

const ownerAlertSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['job_failed', 'printer_offline', 'printer_error', 'paper_out', 'general'],
      default: 'general',
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    orderNumber: {
      type: String,
      default: null,
      trim: true,
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ownerAlertSchema.index({ shop: 1, readAt: 1, createdAt: -1 });

export const OwnerAlert = mongoose.model('OwnerAlert', ownerAlertSchema);
export default OwnerAlert;

