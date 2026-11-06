# EasyPrint: Smart Xerox Automation System

EasyPrint is a full-stack Xerox and print shop automation platform built with MongoDB, Express.js, React.js, Node.js, Redis, BullMQ, Socket.IO, Razorpay, and a companion Windows Printing Agent (.NET 8).

---

## Implementation Status

- **Phase 1 (Customer Web App & Pricing Engine):** COMPLETE (Tests: 6/6 passing)
- **Phase 2 (Owner Dashboard, Live FIFO Queue & Capacity Limit):** COMPLETE (Tests: 7/7 passing)
- **Phase 3A (Razorpay Payments & Windows Agent Server API):** COMPLETE (Tests: 11/11 passing)
- **Phase 3B (C# Windows Background Printing Agent):** PENDING (Next Step)
- **Phase 4 (Super Admin & System Health Monitoring):** PENDING

---

## Phase 3A Features Overview

### 1. Razorpay Payment Gateway Integration
- **Server-Authoritative Pricing:** `POST /api/payments/orders` recalculates the exact print price from raw files and options on the server using `@easyprint/shared`. Clients cannot tamper with order amounts.
- **Razorpay Order Creation:** Creates Razorpay orders in INR (amount in paise), links `razorpayOrderId`, transitions order to `pending_payment`, and records in `Payment` collection.
- **HMAC-SHA256 Signature Verification:** `POST /api/payments/verify` verifies payment authenticity using `crypto.timingSafeEqual` against `RAZORPAY_KEY_SECRET`. On success, atomically enqueues to the shop's BullMQ queue, assigns sequential daily queue number, and creates the `PrintJob`.
- **Idempotent Webhooks:** `POST /api/payments/webhook` mounted with `express.raw({ type: 'application/json' })` before `express.json()`. Verifies `X-Razorpay-Signature` with `RAZORPAY_WEBHOOK_SECRET` and prevents duplicate processing via `WebhookEvent` unique index on `eventId`.
- **Automatic Dev Endpoint Disabling:** The development mark-paid simulator is automatically locked out when `RAZORPAY_KEY_ID` is configured.

### 2. Owner Cancellations & Refunds
- **Atomic Cancellation Guard:** `POST /api/owner/shops/:id/orders/:orderNumber/cancel` rejects with HTTP 409 Conflict if the agent has already started printing or finished (`status: 'printing' | 'completed'`).
- **Instant Gateways Refunds:** If an order was already paid, it triggers an instant Razorpay refund, updates the `Payment` record with `refundId`, marks the order as `refunded`, cancels the BullMQ queue job, and decrements Redis active count.
- **Retry Mechanism:** Failed jobs can be retried via `POST /api/owner/shops/:id/orders/:orderNumber/retry`, resetting attempt counters and re-enqueuing.

### 3. Windows Background Printing Agent Server API
- **Agent Token Pairing:** Owner generates secure 32-byte pairing tokens via `POST /api/owner/shops/:id/agent-token`. The plaintext token is returned only once; only its SHA-256 hash is stored in `AgentDevice`.
- **Agent Authentication:** `requireAgent` middleware authenticates requests via `Authorization: Bearer <token>`.
- **Heartbeat & Health Monitoring:** `POST /api/agent/heartbeat` transmits agent status (`ready`, `offline`, `error`), version, and updates `lastHeartbeatAt`. Emits `agent.status` to `shop:<id>`. If heartbeat > 90 seconds ago, public shop availability automatically switches to `OFFLINE`.
- **Atomic Job Claims with 5-Minute Lease:** `GET /api/agent/jobs/next` atomically claims the oldest queued job for the shop, assigns a 5-minute lease (`leaseExpiresAt`), and returns signed document download URLs. Returns 204 No Content when idle.
- **Lease Expiry Sweeper:** Background sweeper checks expired leases (`leaseExpiresAt < now`). If `attemptCount < 3`, re-queues the job; if `>= 3`, marks it `failed` with alerts.
- **Job Status & Metrics:** `PATCH /api/agent/jobs/:id/status` validates allowed transitions (`claimed` -> `printing` -> `completed` / `failed`) and ensures idempotency using `idempotencyKey`. On completion, records `sheetCount` and `printDurationSeconds` to feed into rolling ETA rolling averages.
- **Secure File Streaming:** `GET /api/agent/jobs/:id/file` and `GET /api/agent/storage-download` provide signed, time-limited document download streams.

### 4. Storage Drivers (Local Disk / S3 / R2)
Controlled by `STORAGE_DRIVER`:
- `STORAGE_DRIVER=local` (default): Persists uploads in `server/uploads/files/` and generates HMAC-signed download URLs.
- `STORAGE_DRIVER=s3` / `r2`: Direct integration with AWS S3 or Cloudflare R2 using `@aws-sdk/client-s3` and presigned URLs.

---

## Monorepo Structure

```
easyprint/
  client/              # React 18 + Vite, Tailwind CSS, Axios, Socket.IO client, AuthContext
  server/              # Express API, Socket.IO, BullMQ, Redis, Mongoose models, Razorpay, Storage
  windows-agent/       # C#/.NET 8 tray printing agent (Phase 3B)
  shared/              # Shared constants, price calculator, and rolling-average ETA engine
  docs/                # Architecture and API reference documentation
```

---

## Environment Variables (`server/.env`)

```ini
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
API_URL=http://localhost:5000
MONGODB_URI=mongodb://127.0.0.1:27017/easyprint
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=easyprint_super_secret_jwt_key_2026
OWNER_SEED_PASSWORD=Owner@123
UPLOAD_DIR=./uploads

# Storage Configuration
STORAGE_DRIVER=local
S3_ENDPOINT=
S3_BUCKET=easyprint-files
S3_REGION=auto
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Razorpay Test Credentials
RAZORPAY_KEY_ID=rzp_test_YourKeyIdHere
RAZORPAY_KEY_SECRET=YourKeySecretHere
RAZORPAY_WEBHOOK_SECRET=YourWebhookSecretHere
```

---

## Testing with Razorpay Test Cards & Webhooks

When testing payments in Razorpay test mode:
1. **Test Cards:**
   - Card Number: `4111 1111 1111 1111`
   - Expiry: Any future date (e.g. `12/28`)
   - CVV: `123`
   - OTP: `123456`
2. **Webhooks:**
   - In Razorpay Dashboard -> Webhooks -> Add Webhook:
     - URL: `https://your-ngrok-or-domain/api/payments/webhook`
     - Secret: Set your `RAZORPAY_WEBHOOK_SECRET`
     - Events: `payment.captured`, `payment.failed`, `refund.processed`
   - Test locally with Razorpay CLI or use our mock end-to-end tests.

---

## Running Automated Tests

Run the full automated test suite:

```bash
# 1. Shared Pricing & ETA Unit Tests (9 tests)
node --test shared/test/pricing.test.js

# 2. Phase 1 Customer Web App & File Processing (6 tests)
node --test server/test/phase1_e2e.test.js

# 3. Phase 2 Owner Auth, Live FIFO Queue & Capacity Limit (7 tests)
node --test server/test/phase2_e2e.test.js

# 4. Phase 3A Razorpay Payments & Windows Agent API (11 tests)
node --test server/test/phase3a_e2e.test.js
```

All 33 test cases pass against real local MongoDB and Redis instances.
