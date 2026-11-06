import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

/**
 * Inspects a file buffer and extracts page count and metadata.
 * For PDF, uses pdf-lib to read exact page count.
 * For JPG/PNG, uses sharp to verify valid image format and dimensions (counts as 1 page).
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<{ pageCount: number, dimensions?: { width: number, height: number } }>}
 */
export async function inspectFileContent(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    try {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();
      return { pageCount: Math.max(1, pageCount) };
    } catch (err) {
      throw new Error(`Failed to read PDF document: ${err.message}`);
    }
  }

  if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('Image data is corrupted or unreadable');
      }
      return {
        pageCount: 1,
        dimensions: { width: metadata.width, height: metadata.height },
      };
    } catch (err) {
      throw new Error(`Invalid image file: ${err.message}`);
    }
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Generates an image thumbnail preview for JPG/PNG files as base64 data URL.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<string>}
 */
export async function generateThumbnail(buffer, mimeType) {
  if (mimeType.startsWith('image/')) {
    try {
      const thumb = await sharp(buffer)
        .resize(300, 300, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();
      return `data:image/jpeg;base64,${thumb.toString('base64')}`;
    } catch {
      return '';
    }
  }
  return '';
}

