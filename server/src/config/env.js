import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from current working directory or server root
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_SECRETS = [
  'easyprint_super_secret_jwt_key_2026',
  'easyprint_secure_storage_secret',
  'default',
  'secret',
  'changeme',
  'password',
];

export const envSchema = z
  .object({
    PORT: z
      .union([z.string(), z.number()])
      .default(5000)
      .transform((val) => Number(val)),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    CLIENT_URL: z.string().default('http://localhost:5173'),
    API_URL: z.string().optional(),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required').default('redis://127.0.0.1:6379'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    OWNER_SEED_EMAIL: z.string().email().optional(),
    OWNER_SEED_PASSWORD: z.string().optional(),
    ADMIN_SEED_EMAIL: z.string().email().optional(),
    ADMIN_SEED_PASSWORD: z.string().optional(),
    UPLOAD_DIR: z.string().default('./uploads'),
    STORAGE_DRIVER: z.enum(['local', 's3', 'r2']).default('local'),
    S3_ENDPOINT: z.string().optional(),
    S3_BUCKET: z.string().default('easyprint-files'),
    S3_REGION: z.string().default('auto'),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    RETENTION_HOURS: z
      .union([z.string(), z.number()])
      .default(24)
      .transform((val) => Number(val)),
    RATE_LIMIT_WINDOW_MS: z
      .union([z.string(), z.number()])
      .default(900000)
      .transform((val) => Number(val)),
    RATE_LIMIT_MAX_AUTH: z
      .union([z.string(), z.number()])
      .default(10)
      .transform((val) => Number(val)),
    RATE_LIMIT_MAX_PAYMENT: z
      .union([z.string(), z.number()])
      .default(30)
      .transform((val) => Number(val)),
    RATE_LIMIT_MAX_UPLOAD: z
      .union([z.string(), z.number()])
      .default(60)
      .transform((val) => Number(val)),
    AGENT_LEASE_SECONDS: z
      .union([z.string(), z.number()])
      .default(300)
      .transform((val) => Number(val)),
  })
  .superRefine((data, ctx) => {
    // In production, reject default/weak secrets
    if (data.NODE_ENV === 'production') {
      if (!data.JWT_SECRET || DEFAULT_SECRETS.includes(data.JWT_SECRET.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET must be set to a secure custom value in production.',
        });
      }

      if (data.RAZORPAY_KEY_ID && (!data.RAZORPAY_KEY_SECRET || DEFAULT_SECRETS.includes(data.RAZORPAY_KEY_SECRET.trim()))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_SECRET'],
          message: 'RAZORPAY_KEY_SECRET is required and must not be default in production.',
        });
      }

      if (data.RAZORPAY_KEY_ID && (!data.RAZORPAY_WEBHOOK_SECRET || DEFAULT_SECRETS.includes(data.RAZORPAY_WEBHOOK_SECRET.trim()))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_WEBHOOK_SECRET'],
          message: 'RAZORPAY_WEBHOOK_SECRET is required and must not be default in production.',
        });
      }
    }

    // Storage driver validation
    if (data.STORAGE_DRIVER === 's3' || data.STORAGE_DRIVER === 'r2') {
      if (!data.AWS_ACCESS_KEY_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AWS_ACCESS_KEY_ID'],
          message: 'AWS_ACCESS_KEY_ID is required when STORAGE_DRIVER is s3 or r2.',
        });
      }
      if (!data.AWS_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AWS_SECRET_ACCESS_KEY'],
          message: 'AWS_SECRET_ACCESS_KEY is required when STORAGE_DRIVER is s3 or r2.',
        });
      }
    }
  });

/**
 * Validates environment variables against envSchema.
 * Throws a formatted Error naming any invalid or missing variables.
 *
 * @param {Record<string, unknown>} [sourceEnv=process.env]
 * @returns {z.infer<typeof envSchema>}
 */
export function validateEnv(sourceEnv = process.env) {
  const result = envSchema.safeParse(sourceEnv);

  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    const errorLines = Object.entries(fieldErrors).map(
      ([key, msgs]) => `  - ${key}: ${msgs.join(', ')}`
    );

    const errorMessage = `[Environment Configuration Error] Missing or invalid environment variable(s):\n${errorLines.join(
      '\n'
    )}`;

    console.error('\n' + errorMessage + '\n');
    throw new Error(errorMessage);
  }

  return result.data;
}

// Auto-validate active environment on import unless in test mode without required vars
let env;
const isTestRun =
  process.env.NODE_ENV === 'test' ||
  process.argv.some((arg) => arg.includes('test') || arg.includes('node:test'));

try {
  env = validateEnv(process.env);
} catch (err) {
  // If in test mode, fall back to safe test defaults
  if (isTestRun) {
    env = envSchema.parse({
      ...process.env,
      MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/easyprint',
      JWT_SECRET: process.env.JWT_SECRET || 'easyprint_super_secret_jwt_key_2026',
    });
  } else {
    throw err;
  }
}

export { env };
export default env;
