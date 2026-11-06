import { Router } from 'express';
import { getShopBySlug, getShopQrCodeImage } from '../controllers/shopController.js';

const router = Router();

router.get('/:slug', getShopBySlug);
router.get('/:slug/qrcode', getShopQrCodeImage);

export default router;

