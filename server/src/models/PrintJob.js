import mongoose from 'mongoose';
import { PRINT_JOB_STATUS } from '@easyprint/shared';

const printJobSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required'],
      unique: true,
      index: true,
    },
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop reference is required'],
      index: true,
    },
    agentDevice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgentDevice',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(PRINT_JOB_STATUS),
      default: PRINT_JOB_STATUS.QUEUED,
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastIdempotencyKey: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    spoolerJobId: {
      type: Number,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for atomic queue claims: oldest queued print job for a shop
printJobSchema.index({ shop: 1, status: 1, createdAt: 1 });
printJobSchema.index({ status: 1, leaseExpiresAt: 1 });

export const PrintJob = mongoose.model('PrintJob', printJobSchema);
export default PrintJob;

