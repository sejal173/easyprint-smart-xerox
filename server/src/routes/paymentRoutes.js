import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createPaymentOrder, verifyPayment, handleWebhook } from '../controllers/paymentController.js';

const router = Router();

const paymentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many payment requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/orders', paymentRateLimiter, createPaymentOrder);
router.post('/verify', paymentRateLimiter, verifyPayment);
router.post('/webhook', handleWebhook);

export default router;

