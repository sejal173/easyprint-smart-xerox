import crypto from 'crypto';
import { validateFileBuffer, sanitizeFileName } from '../utils/fileValidation.js';
import { inspectFileContent, generateThumbnail } from '../utils/pdfProcessor.js';
import { saveFile } from '../config/storage.js';

// Temporary in-memory staging for uploaded files before draft order attachment
export const stagedFilesStore = new Map();

/**
 * Handle multipart uploads of PDF and images.
 * Validates magic bytes, sanitizes filenames, computes page count,
 * saves to storage, and generates preview metadata.
 */
export async function handleFileUpload(req, res, next) {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded. Please attach at least one PDF or image file.',
      });
    }

    const processedFiles = [];

    for (const file of files) {
      // 1. Magic bytes validation
      const validation = validateFileBuffer(file.buffer, file.size);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: `Validation failed for "${file.originalname}": ${validation.error}`,
        });
      }

      // 2. Sanitize filename
      const cleanName = sanitizeFileName(file.originalname);

      // 3. Page count & inspection
      const inspection = await inspectFileContent(file.buffer, validation.mimeType);

      // 4. Generate thumbnail if image
      const thumbnailDataUrl = await generateThumbnail(file.buffer, validation.mimeType);

      // 5. Generate unique storage key and save
      const fileId = crypto.randomUUID();
      const storageKey = `doc_${Date.now()}_${fileId.slice(0, 8)}_${cleanName}`;
      await saveFile(storageKey, file.buffer);

      const fileRecord = {
        fileId,
        originalName: cleanName,
        mimeType: validation.mimeType,
        pageCount: inspection.pageCount,
        sizeBytes: file.size,
        storageKey,
        previewUrl: thumbnailDataUrl || '',
        createdAt: new Date(),
      };

      stagedFilesStore.set(fileId, fileRecord);
      processedFiles.push(fileRecord);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully processed ${processedFiles.length} file(s)`,
      files: processedFiles,
    });
  } catch (err) {
    next(err);
  }
}

