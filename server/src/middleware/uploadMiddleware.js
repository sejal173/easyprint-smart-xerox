import multer from 'multer';
import { MAX_FILE_SIZE_BYTES } from '@easyprint/shared';

// Use memory storage so we can verify magic bytes on the raw buffer before writing to disk
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES, // 20 MB per file
    files: 10, // max 10 files per request
  },
});

