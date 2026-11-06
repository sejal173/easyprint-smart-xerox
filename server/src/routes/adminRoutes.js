import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import {
  getAdminShops,
  updateAdminShopStatus,
  getAdminOrders,
  getAdminOrderByNumber,
  getAdminPayments,
  getAdminUsers,
  updateAdminUser,
} from '../controllers/adminController.js';

const router = Router();

// Protect all admin endpoints with authentication and admin role requirement
router.use(requireAuth, requireAdmin);

// Shops
router.get('/shops', getAdminShops);
router.patch('/shops/:id/status', updateAdminShopStatus);

// Orders
router.get('/orders', getAdminOrders);
router.get('/orders/:orderNumber', getAdminOrderByNumber);

// Payments & Platform Revenue
router.get('/payments', getAdminPayments);

// Users
router.get('/users', getAdminUsers);
router.patch('/users/:id', updateAdminUser);

export default router;

