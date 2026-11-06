import { Router } from 'express';
import { devMarkOrderPaid } from '../controllers/devController.js';

const router = Router();

router.post('/orders/:orderNumber/mark-paid', devMarkOrderPaid);

export default router;

