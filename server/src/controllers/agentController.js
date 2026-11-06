import { z } from 'zod';
import { PrintJob, Order, OrderFile, AgentDevice, OwnerAlert } from '../models/index.js';
import { ALLOWED_JOB_TRANSITIONS } from '@easyprint/shared';
import { getSignedDownloadUrl, getFileStream, verifySignedDownloadToken } from '../config/storage.js';
import { getRedisClient } from '../config/redis.js';
import { emitQueueAndOrderStatus } from '../services/orderQueueService.js';
import { recordOrderEvent } from '../services/orderEventService.js';

const heartbeatSchema = z.object({
  printerStatus: z.enum(['ready', 'offline', 'error']).default('ready'),
  printerError: z.string().nullable().optional().default(null),
  agentVersion: z.string().optional().default('1.0.0'),
});

const updateJobStatusSchema = z.object({
  status: z.enum(['claimed', 'printing', 'completed', 'failed']),
  spoolerJobId: z.number().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  idempotencyKey: z.string().optional(),
});

/**
 * Sweeps expired job leases across all shops.
 * Re-queues jobs if attemptCount < 3; marks failed if attemptCount >= 3.
 */
export async function sweepExpiredLeases(io = null) {
  const now = new Date();
  const expiredJobs = await PrintJob.find({
    status: { $in: ['claimed', 'printing'] },
    leaseExpiresAt: { $lt: now },
  }).populate('order');

  for (const job of expiredJobs) {
    if (job.attemptCount < 3) {
      // Re-queue job for next attempt
      job.status = 'queued';
      job.leaseExpiresAt = null;
      await job.save();

      if (job.order && job.order.status !== 'queued') {
        job.order.status = 'queued';
        await job.order.save();
      }

      if (io && job.order) {
        await emitQueueAndOrderStatus(job.shop.toString(), job.order, io);
      }
    } else {
      // Exceeded max 3 lease attempts: mark failed
      job.status = 'failed';
      job.errorMessage = 'Lease expired after 3 attempts without agent completion';
      job.leaseExpiresAt = null;
      await job.save();

      if (job.order) {
        job.order.status = 'failed';
        await job.order.save();

        try {
          const redis = getRedisClient();
          await redis.decr(`shop:${job.shop}:active_count`);
        } catch {}

        if (io) {
          io.to(`order:${job.order.orderNumber}`).emit('order.status', {
            orderNumber: job.order.orderNumber,
            status: 'failed',
            errorMessage: job.errorMessage,
          });
          await emitQueueAndOrderStatus(job.shop.toString(), job.order, io);
        }
      }
    }
  }
}

/**
 * Agent Heartbeat endpoint.
 * Updates agent device heartbeat timestamp and printer readiness.
 */
export async function agentHeartbeat(req, res, next) {
  try {
    const parseResult = heartbeatSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid heartbeat payload',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { printerStatus, printerError, agentVersion } = parseResult.data;

    req.agent.lastHeartbeatAt = new Date();
    req.agent.printerStatus = printerStatus;
    req.agent.printerError = printerError;
    req.agent.agentVersion = agentVersion;
    await req.agent.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`shop:${req.shop}`).emit('agent.status', {
        agentId: req.agent._id,
        name: req.agent.name,
        printerStatus: req.agent.printerStatus,
        printerError: req.agent.printerError,
        agentVersion: req.agent.agentVersion,
        lastHeartbeatAt: req.agent.lastHeartbeatAt,
      });

      if (req.agent.printerStatus === 'error' || req.agent.printerStatus === 'offline' || req.agent.printerError) {
        const isPaperOut = req.agent.printerError?.toLowerCase().includes('paper');
        const alertType = isPaperOut
          ? 'paper_out'
          : req.agent.printerStatus === 'offline'
          ? 'printer_offline'
          : 'printer_error';

        const alert = await OwnerAlert.create({
          shop: req.shop,
          type: alertType,
          message: req.agent.printerError || `Printer reported status: ${req.agent.printerStatus}`,
        });

        io.to(`shop:${req.shop}`).emit('owner.alert', {
          id: alert._id,
          type: alert.type,
          message: alert.message,
          orderNumber: null,
          createdAt: alert.createdAt,
        });
      }
    }

    return res.status(200).json({
      success: true,
      acknowledgedAt: req.agent.lastHeartbeatAt,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Atomically claims the oldest queued PrintJob for the agent's shop with a 5-minute lease.
 */
export async function claimNextJob(req, res, next) {
  try {
    const io = req.app.get('io');
    // First, sweep any expired leases
    await sweepExpiredLeases(io);

    const now = new Date();
    const leaseDurationMs = 5 * 60 * 1000; // 5-minute lease
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    // Atomic claim on the oldest queued PrintJob
    const job = await PrintJob.findOneAndUpdate(
      {
        shop: req.shop,
        status: 'queued',
      },
      {
        $set: {
          status: 'claimed',
          agentDevice: req.agent._id,
          leaseExpiresAt,
          startedAt: now,
        },
        $inc: { attemptCount: 1 },
      },
      {
        sort: { createdAt: 1 },
        new: true,
      }
    ).populate('order');

    if (!job || !job.order) {
      if (job && !job.order) {
        await PrintJob.findByIdAndDelete(job._id);
      }
      return res.status(204).end();
    }

    const files = await OrderFile.find({ order: job.order._id });
    const filesWithUrls = await Promise.all(
      files.map(async (file) => {
        const downloadUrl = await getSignedDownloadUrl(file.storageKey, 3600);
        return {
          id: file._id,
          originalName: file.originalName,
          mimeType: file.mimeType,
          pageCount: file.pageCount,
          sizeBytes: file.sizeBytes,
          downloadUrl,
        };
      })
    );

    return res.status(200).json({
      success: true,
      job: {
        id: job._id,
        orderNumber: job.order.orderNumber,
        status: job.status,
        leaseExpiresAt: job.leaseExpiresAt,
        attemptCount: job.attemptCount,
        options: job.order.options,
        breakdown: job.order.breakdown,
        totalAmount: job.order.totalAmount,
        files: filesWithUrls,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates status of a claimed/printing job (claimed -> printing -> completed/failed).
 * Idempotent on idempotencyKey.
 */
export async function updateJobStatus(req, res, next) {
  try {
    const parseResult = updateJobStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status update parameters',
        errors: parseResult.error.flatten().fieldErrors,
      });
    }

    const { status, spoolerJobId, errorMessage, idempotencyKey } = parseResult.data;

    const job = await PrintJob.findOne({
      _id: req.params.id,
      shop: req.shop,
    }).populate('order');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: `Print job "${req.params.id}" not found.`,
      });
    }

    // Idempotency: return existing result if already processed with this key
    if (idempotencyKey && job.lastIdempotencyKey === idempotencyKey) {
      return res.status(200).json({
        success: true,
        message: 'Already processed',
        job: {
          id: job._id,
          status: job.status,
          attemptCount: job.attemptCount,
        },
      });
    }

    // Validate state transition
    const allowed = ALLOWED_JOB_TRANSITIONS[job.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid state transition from "${job.status}" to "${status}".`,
      });
    }

    const io = req.app.get('io');

    if (status === 'printing') {
      job.status = 'printing';
      if (spoolerJobId !== undefined) job.spoolerJobId = spoolerJobId;

      if (job.order) {
        job.order.status = 'printing';
        job.order.printingStartedAt = new Date();
        await job.order.save();

        await recordOrderEvent(job.order._id, job.order.orderNumber, 'status_printing', {
          spoolerJobId,
        });

        if (io) {
          io.to(`order:${job.order.orderNumber}`).emit('order.status', {
            orderNumber: job.order.orderNumber,
            status: 'printing',
          });
        }
      }
    } else if (status === 'completed') {
      job.status = 'completed';
      job.completedAt = new Date();
      job.leaseExpiresAt = null;

      if (job.order) {
        const sheetsPerCopy =
          job.order.breakdown?.sheetsPerCopy ||
          Math.ceil((job.order.breakdown?.effectivePages || 1) / (job.order.options?.sides === 'double' ? 2 : 1));
        const totalSheets = sheetsPerCopy * (job.order.options?.copies || 1);
        const durationSeconds = job.startedAt
          ? Math.max(1, Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000))
          : 5;

        job.order.sheetCount = totalSheets;
        job.order.printDurationSeconds = durationSeconds;
        job.order.completedAt = new Date();
        job.order.status = 'completed';
        await job.order.save();

        await recordOrderEvent(job.order._id, job.order.orderNumber, 'status_completed', {
          sheetCount: totalSheets,
          printDurationSeconds: durationSeconds,
        });

        try {
          const redis = getRedisClient();
          await redis.decr(`shop:${job.shop}:active_count`);
        } catch {}

        if (io) {
          // Emit order.completed carrying queueNumber for customer completion modal
          io.to(`order:${job.order.orderNumber}`).emit('order.completed', {
            orderNumber: job.order.orderNumber,
            queueNumber: job.order.queueNumber,
            status: 'completed',
            completedAt: job.order.completedAt,
          });
          io.to(`shop:${job.shop}`).emit('order.completed', {
            orderNumber: job.order.orderNumber,
            queueNumber: job.order.queueNumber,
            status: 'completed',
            completedAt: job.order.completedAt,
          });
          await emitQueueAndOrderStatus(job.shop.toString(), job.order, io);
        }
      }
    } else if (status === 'failed') {
      job.status = 'failed';
      job.errorMessage = errorMessage || 'Printing agent reported error';
      job.leaseExpiresAt = null;

      if (job.order) {
        job.order.status = 'failed';
        await job.order.save();

        await recordOrderEvent(job.order._id, job.order.orderNumber, 'status_failed', {
          errorMessage: job.errorMessage,
        });

        try {
          const redis = getRedisClient();
          await redis.decr(`shop:${job.shop}:active_count`);
        } catch {}

        // Create persistent OwnerAlert record for failed print job
        const alert = await OwnerAlert.create({
          shop: job.shop,
          type: 'job_failed',
          message: `Job ${job.order.orderNumber} failed: ${job.errorMessage}`,
          orderNumber: job.order.orderNumber,
        });

        if (io) {
          io.to(`shop:${job.shop}`).emit('owner.alert', {
            id: alert._id,
            type: alert.type,
            message: alert.message,
            orderNumber: alert.orderNumber,
            createdAt: alert.createdAt,
          });

          io.to(`order:${job.order.orderNumber}`).emit('order.status', {
            orderNumber: job.order.orderNumber,
            status: 'failed',
            errorMessage: job.errorMessage,
          });
          await emitQueueAndOrderStatus(job.shop.toString(), job.order, io);
        }
      }
    }

    if (idempotencyKey) {
      job.lastIdempotencyKey = idempotencyKey;
    }

    await job.save();

    return res.status(200).json({
      success: true,
      message: `Job status updated to "${status}".`,
      job: {
        id: job._id,
        status: job.status,
        attemptCount: job.attemptCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Streams job file directly to agent.
 */
export async function getJobFile(req, res, next) {
  try {
    const job = await PrintJob.findOne({
      _id: req.params.id,
      shop: req.shop,
    }).populate('order');

    if (!job) {
      return res.status(404).json({ success: false, message: 'Print job not found' });
    }

    const files = await OrderFile.find({ order: job.order._id });
    if (!files || files.length === 0) {
      return res.status(404).json({ success: false, message: 'No files attached to this job' });
    }

    const file = files[0];
    if (file.deletedAt) {
      return res.status(410).json({
        success: false,
        message: 'File has expired and been deleted under retention policy',
      });
    }

    const stream = await getFileStream(file.storageKey);

    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    return stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

/**
 * Download route for signed storage URLs.
 * Validates HMAC signature and timestamp expiry.
 */
export async function downloadSignedFile(req, res, next) {
  try {
    const { key, expires, sig } = req.query;
    if (!key || !expires || !sig) {
      return res.status(400).json({ success: false, message: 'Missing signed download parameters' });
    }

    const isValid = verifySignedDownloadToken(key, expires, sig);
    if (!isValid) {
      return res.status(403).json({ success: false, message: 'Signed URL has expired or signature is invalid' });
    }

    // Check file retention status
    const fileRecord = await OrderFile.findOne({ storageKey: key });
    if (fileRecord && fileRecord.deletedAt) {
      return res.status(410).json({
        success: false,
        message: 'File has expired and been deleted under retention policy',
      });
    }

    const stream = await getFileStream(key);
    res.setHeader('Content-Type', 'application/octet-stream');
    return stream.pipe(res);
  } catch (err) {
    if (err.code === 'ENOENT' || err.statusCode === 404) {
      return res.status(410).json({
        success: false,
        message: 'File has expired and been deleted under retention policy',
      });
    }
    next(err);
  }
}

/**
 * Renews the lease for a job currently claimed or printing by this device.
 * Sets leaseExpiresAt = now + AGENT_LEASE_SECONDS (default 300).
 * Returns 409 if the job is no longer owned by this device.
 */
export async function renewJobLease(req, res, next) {
  try {
    const { id } = req.params;
    const { idempotencyKey } = req.body || {};

    const job = await PrintJob.findById(id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Print job not found.' });
    }

    if (!job.shop.equals(req.shop)) {
      return res.status(404).json({ success: false, message: 'Print job not found for this shop.' });
    }

    if (!['claimed', 'printing'].includes(job.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot renew lease for job in status "${job.status}".`,
      });
    }

    // Ownership check: must be owned by the calling device
    if (!job.agentDevice || !job.agentDevice.equals(req.agent._id)) {
      return res.status(409).json({
        success: false,
        message: 'Job is no longer owned by this device.',
      });
    }

    const leaseSeconds = parseInt(process.env.AGENT_LEASE_SECONDS || '300', 10);
    const newExpiresAt = new Date(Date.now() + leaseSeconds * 1000);
    job.leaseExpiresAt = newExpiresAt;

    if (idempotencyKey) {
      job.lastIdempotencyKey = idempotencyKey;
    }

    await job.save();

    return res.status(200).json({
      success: true,
      message: 'Lease renewed successfully',
      jobId: job._id,
      leaseExpiresAt: job.leaseExpiresAt,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Reconciliation endpoint: returns server status for a job owned by this device.
 * Used by the agent on startup or crash recovery.
 */
export async function getJobStatus(req, res, next) {
  try {
    const { id } = req.params;

    const job = await PrintJob.findOne({
      _id: id,
      shop: req.shop,
      agentDevice: req.agent._id,
    }).populate('order', 'orderNumber');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: `Print job "${id}" not found for this device.`,
      });
    }

    return res.status(200).json({
      success: true,
      jobId: job._id,
      status: job.status,
      attemptCount: job.attemptCount,
      spoolerJobId: job.spoolerJobId,
      leaseExpiresAt: job.leaseExpiresAt,
      orderNumber: job.order?.orderNumber || null,
    });
  } catch (err) {
    next(err);
  }
}
