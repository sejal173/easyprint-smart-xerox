import { Router } from 'express';
import { uploadMiddleware } from '../middleware/uploadMiddleware.js';
import { handleFileUpload } from '../controllers/uploadController.js';

const router = Router();

// Handle multiple file upload under field name 'files'
router.post('/', uploadMiddleware.array('files', 10), handleFileUpload);

export default router;

