import { Router } from 'express';
import { calculateQuote } from '../controllers/pricingController.js';

const router = Router();

router.post('/quote', calculateQuote);

export default router;

