import { Router } from 'express';
import { requireAuth, requireOwner } from '../middleware/authMiddleware.js';
import {
  createShop,
  getOwnerShops,
  getOwnerShopById,
  updateOwnerShop,
  updateShopStatus,
  getPrinters,
  addPrinter,
  updatePrinter,
  deletePrinter,
  getShopQr,
  downloadShopQr,
  getOwnerQueue,
  cancelOrder,
  retryOrder,
  createAgentToken,
  getShopAlerts,
  markAlertAsRead,
  getShopAnalytics,
  exportOrdersCsv,
} from '../controllers/ownerShopController.js';

const router = Router();

// Protect all owner routes
router.use(requireAuth, requireOwner);

// Shop profile routes
router.post('/', createShop);
router.get('/', getOwnerShops);
router.get('/:id', getOwnerShopById);
router.put('/:id', updateOwnerShop);
router.patch('/:id/status', updateShopStatus);

// Printer management
router.get('/:id/printers', getPrinters);
router.post('/:id/printers', addPrinter);
router.put('/:id/printers/:printerId', updatePrinter);
router.delete('/:id/printers/:printerId', deletePrinter);

// QR Code
router.get('/:id/qr', getShopQr);
router.get('/:id/qr/download', downloadShopQr);

// Live FIFO Queue
router.get('/:id/queue', getOwnerQueue);

// Order actions: Cancel & Retry
router.post('/:id/orders/:orderNumber/cancel', cancelOrder);
router.post('/:id/orders/:orderNumber/retry', retryOrder);

// Windows Agent pairing token
router.post('/:id/agent-token', createAgentToken);

// Alerts
router.get('/:id/alerts', getShopAlerts);
router.patch('/:id/alerts/:alertId/read', markAlertAsRead);

// Analytics & CSV Export
router.get('/:id/analytics', getShopAnalytics);
router.get('/:id/orders.csv', exportOrdersCsv);

export default router;

