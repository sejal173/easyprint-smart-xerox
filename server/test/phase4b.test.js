process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import bcrypt from 'bcryptjs';

import { app, validateProductionSecrets } from '../src/server.js';
import { connectDB } from '../src/config/db.js';
import { getRedisClient, closeRedis } from '../src/config/redis.js';
import { User, Shop } from '../src/models/index.js';
import { seedAdminUser } from '../src/utils/seedAdmin.js';
import { seedOwnerUser } from '../src/scripts/seed.js';
import { validateEnv } from '../src/config/env.js';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

let server;
let baseUrl;

test.before(async () => {
  await connectDB();
  getRedisClient();

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await closeRedis();
  } catch {}
  try {
    await mongoose.disconnect();
  } catch {}
});

// =========================================================================
// 1. SEED IDEMPOTENCY & SECRETS ENFORCEMENT
// =========================================================================

test('1.1: Admin seed throws clear error if ADMIN_SEED_PASSWORD is not set', async () => {
  const origEmail = process.env.ADMIN_SEED_EMAIL;
  const origPass = process.env.ADMIN_SEED_PASSWORD;
  delete process.env.ADMIN_SEED_PASSWORD;
  process.env.ADMIN_SEED_EMAIL = 'new_admin_no_pass@easyprint.test';

  try {
    await assert.rejects(
      async () => {
        await seedAdminUser();
      },
      (err) => {
        assert.match(err.message, /ADMIN_SEED_PASSWORD/);
        return true;
      }
    );
  } finally {
    process.env.ADMIN_SEED_EMAIL = origEmail;
    process.env.ADMIN_SEED_PASSWORD = origPass;
  }
});

test('1.2: Admin seed is idempotent and does NOT overwrite existing password on subsequent runs', async () => {
  const testAdminEmail = 'idempotent_admin@easyprint.test';
  await User.deleteMany({ email: testAdminEmail });

  // 1. First run: seed admin with initial password
  process.env.ADMIN_SEED_EMAIL = testAdminEmail;
  process.env.ADMIN_SEED_PASSWORD = 'InitialAdminPassword_123!';
  const createdAdmin = await seedAdminUser();
  assert.equal(createdAdmin.email, testAdminEmail);
  const initialHash = createdAdmin.passwordHash;

  const initialMatches = await bcrypt.compare('InitialAdminPassword_123!', initialHash);
  assert.equal(initialMatches, true, 'Initial password should match hashed password');

  // 2. Second run: run seed with a DIFFERENT password
  process.env.ADMIN_SEED_PASSWORD = 'AttemptedOverwritePassword_456!';
  const secondRunAdmin = await seedAdminUser();
  assert.equal(secondRunAdmin.email, testAdminEmail);

  // 3. Confirm password in DB was NOT changed
  const adminInDb = await User.findOne({ email: testAdminEmail });
  assert.equal(adminInDb.passwordHash, initialHash, 'Password hash must remain identical across seed runs');

  const stillMatchesOld = await bcrypt.compare('InitialAdminPassword_123!', adminInDb.passwordHash);
  assert.equal(stillMatchesOld, true, 'Original password must still authenticate');

  const matchesNew = await bcrypt.compare('AttemptedOverwritePassword_456!', adminInDb.passwordHash);
  assert.equal(matchesNew, false, 'New password must NOT overwrite the stored credentials');

  // Cleanup
  await User.deleteMany({ email: testAdminEmail });
});

test('1.3: Owner seed throws clear error if OWNER_SEED_PASSWORD is not set', async () => {
  const origPass = process.env.OWNER_SEED_PASSWORD;
  delete process.env.OWNER_SEED_PASSWORD;

  try {
    await assert.rejects(
      async () => {
        await seedOwnerUser();
      },
      (err) => {
        assert.match(err.message, /OWNER_SEED_PASSWORD/);
        return true;
      }
    );
  } finally {
    process.env.OWNER_SEED_PASSWORD = origPass;
  }
});

test('1.4: Owner seed is idempotent and does NOT overwrite existing owner credentials', async () => {
  const testOwnerEmail = 'idempotent_owner@easyprint.test';
  await User.deleteMany({ email: testOwnerEmail });

  // 1. First run
  process.env.OWNER_SEED_EMAIL = testOwnerEmail;
  process.env.OWNER_SEED_PASSWORD = 'InitialOwnerPassword_123!';
  const { owner: createdOwner } = await seedOwnerUser();
  assert.equal(createdOwner.email, testOwnerEmail);
  const initialHash = createdOwner.passwordHash;

  // 2. Second run with different password
  process.env.OWNER_SEED_PASSWORD = 'AttemptedNewOwnerPassword_789!';
  const { owner: secondRunOwner } = await seedOwnerUser();
  assert.equal(secondRunOwner.email, testOwnerEmail);

  // 3. Verify database record
  const ownerInDb = await User.findOne({ email: testOwnerEmail });
  assert.equal(ownerInDb.passwordHash, initialHash, 'Owner password hash must remain unchanged');

  const originalWorks = await bcrypt.compare('InitialOwnerPassword_123!', ownerInDb.passwordHash);
  assert.equal(originalWorks, true);

  // Cleanup
  await User.deleteMany({ email: testOwnerEmail });
});

// =========================================================================
// 2. ENVIRONMENT VALIDATION
// =========================================================================

test('2.1: validateEnv throws error naming missing MONGODB_URI', () => {
  assert.throws(
    () => {
      validateEnv({
        NODE_ENV: 'development',
        // MONGODB_URI missing
        REDIS_URL: 'redis://127.0.0.1:6379',
        JWT_SECRET: 'test_secret_for_environment_validation_suite',
      });
    },
    (err) => {
      assert.match(err.message, /MONGODB_URI/);
      return true;
    }
  );
});

test('2.2: validateEnv throws error naming missing JWT_SECRET in production mode', () => {
  assert.throws(
    () => {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/easyprint',
        REDIS_URL: 'redis://127.0.0.1:6379',
        JWT_SECRET: 'changeme', // weak/forbidden default secret
      });
    },
    (err) => {
      assert.match(err.message, /JWT_SECRET/);
      return true;
    }
  );
});

test('2.3: validateEnv throws error naming missing AWS credentials when STORAGE_DRIVER is s3', () => {
  assert.throws(
    () => {
      validateEnv({
        NODE_ENV: 'development',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/easyprint',
        REDIS_URL: 'redis://127.0.0.1:6379',
        JWT_SECRET: 'test_secret_for_environment_validation_suite',
        STORAGE_DRIVER: 's3',
        // AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY missing
      });
    },
    (err) => {
      assert.match(err.message, /AWS_ACCESS_KEY_ID/);
      assert.match(err.message, /AWS_SECRET_ACCESS_KEY/);
      return true;
    }
  );
});

test('2.4: validateEnv succeeds and returns typed object with defaults when valid', () => {
  const result = validateEnv({
    NODE_ENV: 'development',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/easyprint',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_SECRET: 'test_secret_for_environment_validation_suite',
  });

  assert.equal(result.PORT, 5000);
  assert.equal(result.STORAGE_DRIVER, 'local');
  assert.equal(result.RETENTION_HOURS, 24);
  assert.equal(result.AGENT_LEASE_SECONDS, 300);
});

// =========================================================================
// 3. HEALTH CHECK ENDPOINT (/health)
// =========================================================================

test('3.1: GET /health returns 200 and healthy status when all services are connected', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.status, 'healthy');
  assert.equal(data.services.database, 'connected');
  assert.equal(data.services.redis, 'connected');
  assert.ok(data.timestamp);
});

test('3.2: GET /health returns 503 and unhealthy status when Redis is down', async () => {
  const redis = getRedisClient();
  const originalPing = redis.ping.bind(redis);

  // Mock Redis failure
  redis.ping = async () => {
    throw new Error('Connection to Redis refused on port 6379');
  };

  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 503, 'Should return HTTP 503 Service Unavailable');

    const data = await res.json();
    assert.equal(data.status, 'unhealthy');
    assert.equal(data.services.redis, 'disconnected');
  } finally {
    // Restore original ping
    redis.ping = originalPing;
  }
});

// =========================================================================
// 4. CHECK-SECRETS CI/PRE-COMMIT SCRIPT
// =========================================================================

test('4.1: check-secrets script succeeds when repo is clean', () => {
  const isWindows = process.platform === 'win32';
  const scriptPath = isWindows
    ? path.join(REPO_ROOT, 'scripts', 'check-secrets.ps1')
    : path.join(REPO_ROOT, 'scripts', 'check-secrets.sh');

  const cmd = isWindows ? 'powershell' : 'bash';
  const args = isWindows ? ['-ExecutionPolicy', 'Bypass', '-File', scriptPath] : [scriptPath];

  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0, `Expected check-secrets to pass, but got code ${result.status}: ${result.stdout} ${result.stderr}`);
  assert.match(result.stdout, /No default secrets detected/);
});

test('4.2: check-secrets script fails when a file contains forbidden default credentials', () => {
  const isWindows = process.platform === 'win32';
  const scriptPath = isWindows
    ? path.join(REPO_ROOT, 'scripts', 'check-secrets.ps1')
    : path.join(REPO_ROOT, 'scripts', 'check-secrets.sh');

  // Create temporary file with forbidden secret in a scanned directory
  const tempFilePath = path.join(REPO_ROOT, 'docs', 'temp_forbidden_test_file.txt');
  fs.writeFileSync(tempFilePath, 'This file contains forbidden credential: ' + ['Owner', '123'].join('@'), 'utf-8');

  try {
    const cmd = isWindows ? 'powershell' : 'bash';
    const args = isWindows ? ['-ExecutionPolicy', 'Bypass', '-File', scriptPath] : [scriptPath];

    const result = spawnSync(cmd, args, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });

    assert.equal(result.status, 1, 'Expected check-secrets to fail with exit code 1 when forbidden string exists');
    assert.match(result.stdout, /SECURITY VIOLATION/);
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

// =========================================================================
// 5. DOCKER & CONTAINERIZATION VERIFICATION
// =========================================================================

test('5.1: docker compose config validates syntax and structure (or documents NOT RUN if Docker is not installed)', () => {
  const composePath = path.join(REPO_ROOT, 'docker-compose.yml');
  assert.ok(fs.existsSync(composePath), 'docker-compose.yml must exist at repository root');

  const composeContent = fs.readFileSync(composePath, 'utf-8');
  assert.match(composeContent, /mongo:/);
  assert.match(composeContent, /redis:/);
  assert.match(composeContent, /api:/);
  assert.match(composeContent, /worker:/);
  assert.match(composeContent, /web:/);

  // Check if Docker CLI is installed on this host
  const checkDocker = spawnSync('docker', ['--version'], { encoding: 'utf-8' });
  if (checkDocker.error || checkDocker.status !== 0) {
    console.log('\n  [INFO] Docker CLI is not installed on this host environment.');
    console.log('  docker compose up status: NOT RUN (Host environment lacks Docker CLI runtime)\n');
    assert.ok(true, 'Docker CLI absent; validated configuration file presence and service schemas');
    return;
  }

  // If docker is installed, run docker compose config
  const configResult = spawnSync('docker', ['compose', 'config'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
  });

  assert.equal(configResult.status, 0, `docker compose config failed: ${configResult.stderr}`);
});

// =========================================================================
// 6. PAYMENT SIMULATION GUARDS
// =========================================================================

test('6.1: validateEnv throws error if ALLOW_DEV_PAYMENT_SIMULATION is true in production mode', () => {
  assert.throws(
    () => {
      validateEnv({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/easyprint',
        REDIS_URL: 'redis://127.0.0.1:6379',
        JWT_SECRET: 'secure_custom_production_jwt_secret_key_123456789',
        ALLOW_DEV_PAYMENT_SIMULATION: true,
      });
    },
    (err) => {
      assert.match(err.message, /ALLOW_DEV_PAYMENT_SIMULATION/);
      return true;
    }
  );
});

test('6.2: validateProductionSecrets throws error if ALLOW_DEV_PAYMENT_SIMULATION is enabled in production', () => {
  const origEnv = process.env.NODE_ENV;
  const origSim = process.env.ALLOW_DEV_PAYMENT_SIMULATION;
  const origJwt = process.env.JWT_SECRET;

  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'valid_production_secret_key_long_enough';
    process.env.RAZORPAY_KEY_SECRET = 'valid_production_rzp_secret_key';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'valid_production_rzp_webhook_secret';
    process.env.ALLOW_DEV_PAYMENT_SIMULATION = 'true';

    assert.throws(
      () => {
        validateProductionSecrets();
      },
      (err) => {
        assert.match(err.message, /Refusing to boot in production with ALLOW_DEV_PAYMENT_SIMULATION=true/);
        return true;
      }
    );
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.ALLOW_DEV_PAYMENT_SIMULATION = origSim;
    process.env.JWT_SECRET = origJwt;
  }
});

test('6.3: POST /api/dev/orders/:orderNumber/mark-paid returns 403 when RAZORPAY_KEY_ID is set (e.g. placeholder)', async () => {
  const origKey = process.env.RAZORPAY_KEY_ID;
  const origSim = process.env.ALLOW_DEV_PAYMENT_SIMULATION;

  try {
    process.env.ALLOW_DEV_PAYMENT_SIMULATION = 'true';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholder';

    const res = await fetch(`${baseUrl}/api/dev/orders/ORD-TEST-DUMMY/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 403, 'Should return HTTP 403 Forbidden when RAZORPAY_KEY_ID is configured');
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /disabled/);
  } finally {
    if (origKey !== undefined) {
      process.env.RAZORPAY_KEY_ID = origKey;
    } else {
      delete process.env.RAZORPAY_KEY_ID;
    }
    if (origSim !== undefined) {
      process.env.ALLOW_DEV_PAYMENT_SIMULATION = origSim;
    } else {
      delete process.env.ALLOW_DEV_PAYMENT_SIMULATION;
    }
  }
});

test('6.4: POST /api/dev/orders/:orderNumber/mark-paid returns 403 when ALLOW_DEV_PAYMENT_SIMULATION is false/unset', async () => {
  const origKey = process.env.RAZORPAY_KEY_ID;
  const origSim = process.env.ALLOW_DEV_PAYMENT_SIMULATION;

  try {
    delete process.env.RAZORPAY_KEY_ID;
    process.env.ALLOW_DEV_PAYMENT_SIMULATION = 'false';

    const res = await fetch(`${baseUrl}/api/dev/orders/ORD-TEST-DUMMY/mark-paid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 403, 'Should return HTTP 403 Forbidden when ALLOW_DEV_PAYMENT_SIMULATION is false');
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /disabled/);
  } finally {
    if (origKey !== undefined) {
      process.env.RAZORPAY_KEY_ID = origKey;
    } else {
      delete process.env.RAZORPAY_KEY_ID;
    }
    if (origSim !== undefined) {
      process.env.ALLOW_DEV_PAYMENT_SIMULATION = origSim;
    } else {
      delete process.env.ALLOW_DEV_PAYMENT_SIMULATION;
    }
  }
});
