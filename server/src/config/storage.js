import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
export const FILES_DIR = path.join(UPLOAD_DIR, 'files');
export const TEMP_UPLOAD_DIR = path.join(UPLOAD_DIR, 'temp');

const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';

// Lazy-loaded AWS S3 Client
let s3ClientInstance = null;

async function getS3Client() {
  if (!s3ClientInstance) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const config = {
      region: process.env.AWS_REGION || process.env.S3_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '',
      },
    };

    if (process.env.S3_ENDPOINT) {
      config.endpoint = process.env.S3_ENDPOINT;
      config.forcePathStyle = true;
    }

    s3ClientInstance = new S3Client(config);
  }
  return s3ClientInstance;
}

/**
 * Initializes upload directories or verifies remote storage.
 */
export async function initStorage() {
  await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
  await fs.mkdir(FILES_DIR, { recursive: true });
}

/**
 * Saves a file buffer to storage.
 *
 * @param {string} storageKey
 * @param {Buffer} buffer
 * @param {string} [mimeType='application/octet-stream']
 * @returns {Promise<string>} storageKey
 */
export async function saveFile(storageKey, buffer, mimeType = 'application/octet-stream') {
  await initStorage();

  if (STORAGE_DRIVER === 's3' || STORAGE_DRIVER === 'r2') {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = await getS3Client();
    const bucket = process.env.S3_BUCKET || 'easyprint-files';

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    return storageKey;
  }

  // Local storage: persist permanently in FILES_DIR
  const filePath = path.join(FILES_DIR, storageKey);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

/**
 * Retrieves a file buffer from storage.
 *
 * @param {string} storageKey
 * @returns {Promise<Buffer>}
 */
export async function getFile(storageKey) {
  if (STORAGE_DRIVER === 's3' || STORAGE_DRIVER === 'r2') {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = await getS3Client();
    const bucket = process.env.S3_BUCKET || 'easyprint-files';

    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      })
    );
    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  // Try FILES_DIR first, then fallback to TEMP_UPLOAD_DIR for backwards compatibility
  const filePath = path.join(FILES_DIR, storageKey);
  try {
    return await fs.readFile(filePath);
  } catch (err) {
    const legacyPath = path.join(TEMP_UPLOAD_DIR, storageKey);
    return await fs.readFile(legacyPath);
  }
}

/**
 * Retrieves a readable stream for a file.
 *
 * @param {string} storageKey
 * @returns {Promise<NodeJS.ReadableStream>}
 */
export async function getFileStream(storageKey) {
  if (STORAGE_DRIVER === 's3' || STORAGE_DRIVER === 'r2') {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = await getS3Client();
    const bucket = process.env.S3_BUCKET || 'easyprint-files';

    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      })
    );
    return response.Body;
  }

  const filePath = path.join(FILES_DIR, storageKey);
  try {
    await fs.access(filePath);
    return createReadStream(filePath);
  } catch {
    const legacyPath = path.join(TEMP_UPLOAD_DIR, storageKey);
    return createReadStream(legacyPath);
  }
}

/**
 * Generates a signed download URL for an uploaded file.
 *
 * @param {string} storageKey
 * @param {number} [expiresInSeconds=3600]
 * @param {string} [baseUrl]
 * @returns {Promise<string>}
 */
export async function getSignedDownloadUrl(storageKey, expiresInSeconds = 3600, baseUrl = '') {
  if (STORAGE_DRIVER === 's3' || STORAGE_DRIVER === 'r2') {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const s3 = await getS3Client();
    const bucket = process.env.S3_BUCKET || 'easyprint-files';

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    });
    return await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  }

  // Local storage signed URL
  const secret = process.env.JWT_SECRET || 'easyprint_secure_storage_secret';
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${storageKey}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const base = baseUrl || process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${base}/api/agent/storage-download?key=${encodeURIComponent(storageKey)}&expires=${expiresAt}&sig=${sig}`;
}

/**
 * Verifies local signed download URL parameters.
 *
 * @param {string} storageKey
 * @param {number|string} expiresAt
 * @param {string} signature
 * @returns {boolean}
 */
export function verifySignedDownloadToken(storageKey, expiresAt, signature) {
  if (!storageKey || !expiresAt || !signature) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Number(expiresAt) < now) return false;

  const secret = process.env.JWT_SECRET || 'easyprint_secure_storage_secret';
  const payload = `${storageKey}:${expiresAt}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}
