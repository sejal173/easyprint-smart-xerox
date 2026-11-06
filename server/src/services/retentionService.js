import { Order, OrderFile } from '../models/index.js';
import { deleteFile } from '../config/storage.js';
import { recordOrderEvent } from './orderEventService.js';

/**
 * Executes the file retention policy:
 * 1. Deletes physical file bytes for orders completed > 0 minutes ago (print finished).
 * 2. Deletes physical file bytes for orders older than 24h (unless queued, claimed, or printing).
 * 3. Sets OrderFile.deletedAt and records an OrderEvent. Order records and financial totals remain intact.
 *
 * @returns {Promise<{ deletedOrdersCount: number, deletedFilesCount: number }>}
 */
export async function runFileRetentionCleanup() {
  let deletedOrdersCount = 0;
  let deletedFilesCount = 0;

  try {
    const now = new Date();
    const retentionHours = parseInt(process.env.RETENTION_HOURS || '24', 10);
    const cutoff24h = new Date(now.getTime() - retentionHours * 60 * 60 * 1000);

    // Find orders eligible for retention cleanup
    const eligibleOrders = await Order.find({
      $or: [
        // Case A: Completed print jobs
        {
          status: 'completed',
          completedAt: { $exists: true, $ne: null, $lte: now },
        },
        // Case B: Any order older than 24 hours (unless in progress)
        {
          createdAt: { $lt: cutoff24h },
          status: { $nin: ['queued', 'claimed', 'printing'] },
        },
      ],
    }).select('_id orderNumber status completedAt createdAt');

    for (const order of eligibleOrders) {
      // Find non-deleted files for this order
      const files = await OrderFile.find({
        order: order._id,
        deletedAt: null,
      });

      if (files.length === 0) continue;

      let filesRemovedForOrder = 0;
      for (const file of files) {
        try {
          await deleteFile(file.storageKey);
          file.deletedAt = new Date();
          await file.save();
          filesRemovedForOrder++;
          deletedFilesCount++;
        } catch (fileErr) {
          console.error(`[Retention] Error deleting file ${file.storageKey}:`, fileErr.message);
        }
      }

      if (filesRemovedForOrder > 0) {
        deletedOrdersCount++;
        await recordOrderEvent(order._id, order.orderNumber, 'file_retention_deleted', {
          filesCount: filesRemovedForOrder,
          orderStatus: order.status,
          deletedAt: new Date(),
        });
      }
    }

    if (deletedFilesCount > 0) {
      console.log(`[Retention Policy] Purged ${deletedFilesCount} file(s) across ${deletedOrdersCount} order(s).`);
    }
  } catch (err) {
    console.error('[Retention Policy Error]:', err.message);
  }

  return { deletedOrdersCount, deletedFilesCount };
}

export const purgeRetainedFiles = runFileRetentionCleanup;
export default runFileRetentionCleanup;
