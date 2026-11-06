import { Router } from 'express';
import { createDraftOrder, getOrderByNumber } from '../controllers/orderController.js';

const router = Router();

router.post('/draft', createDraftOrder);
router.get('/:orderNumber', getOrderByNumber);

export default router;

