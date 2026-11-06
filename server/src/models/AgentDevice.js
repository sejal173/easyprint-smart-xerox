import mongoose from 'mongoose';

const agentDeviceSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop reference is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Device name is required'],
      trim: true,
      default: 'Shop Printer Agent',
    },
    tokenHash: {
      type: String,
      required: [true, 'Token hash is required'],
      unique: true,
      index: true,
    },
    lastHeartbeatAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    printerStatus: {
      type: String,
      enum: ['ready', 'offline', 'error'],
      default: 'offline',
    },
    printerError: {
      type: String,
      default: null,
    },
    agentVersion: {
      type: String,
      default: '1.0.0',
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const AgentDevice = mongoose.model('AgentDevice', agentDeviceSchema);
export default AgentDevice;

