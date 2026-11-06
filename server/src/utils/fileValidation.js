import fs from 'fs/promises';
import path from 'path';
import { MAX_FILE_SIZE_BYTES } from '@easyprint/shared';

/**
 * Checks the true file type by inspecting initial magic bytes.
 *
 * @param {Buffer} buffer
 * @returns {{ isValid: boolean, mimeType: string, extension: string }}
 */
export function detectMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) {
    return { isValid: false, mimeType: '', extension: '' };
  }

  // PDF: %PDF- (0x25, 0x50, 0x44, 0x46)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { isValid: true, mimeType: 'application/pdf', extension: '.pdf' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { isValid: true, mimeType: 'image/png', extension: '.png' };
  }

  // JPEG: FF D8 FF
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { isValid: true, mimeType: 'image/jpeg', extension: '.jpg' };
  }

  return { isValid: false, mimeType: '', extension: '' };
}

/**
 * Validates file buffer against magic bytes and size constraints.
 *
 * @param {Buffer} buffer
 * @param {number} sizeBytes
 * @returns {{ valid: boolean, error?: string, mimeType?: string, extension?: string }}
 */
export function validateFileBuffer(buffer, sizeBytes) {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 20MB limit (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB)`,
    };
  }

  const { isValid, mimeType, extension } = detectMagicBytes(buffer);
  if (!isValid) {
    return {
      valid: false,
      error: 'Invalid file content: only genuine PDF, JPG, JPEG, and PNG files are accepted.',
    };
  }

  return { valid: true, mimeType, extension };
}

/**
 * Sanitizes a user-supplied file name to prevent directory traversal
 * and remove dangerous characters.
 *
 * @param {string} rawName
 * @returns {string}
 */
export function sanitizeFileName(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return `document_${Date.now()}`;
  }

  const base = path.basename(rawName);
  const ext = path.extname(base);
  const nameWithoutExt = path.basename(base, ext);

  // Replace special characters and whitespace with underscores
  const cleanName = nameWithoutExt
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, '');
  return `${cleanName || 'file'}${cleanExt}`;
}

