# EasyPrint: Smart Xerox Automation System

EasyPrint is a full-stack Xerox and print shop automation platform built with MongoDB, Express.js, React.js, Node.js, Redis, BullMQ, Socket.IO, Razorpay, and a companion Windows Printing Agent (.NET 8).

---

## Implementation Status

- **Phase 1 (Customer Web App & Pricing Engine):** COMPLETE (Tests: 6/6 passing)
- **Phase 2 (Owner Dashboard, Live FIFO Queue & Capacity Limit):** COMPLETE (Tests: 7/7 passing)
- **Phase 3A (Razorpay Payments & Agent Server API):** COMPLETE (Tests: 11/11 passing)
- **Phase 3B (Windows Agent Tray App & xUnit Suite):** COMPLETE (Tests: 6/6 server, 36/36 xUnit passing)
- **Phase 4A (Notifications, Analytics, Admin Panel, Retention & Hardening):** COMPLETE (Tests: 12/12 passing)
- **Phase 4B (Verification, Security Cleanup, Docker & CI/CD):** COMPLETE (Tests: 13/13 passing)

**Total Test Suite Status:** 100 / 100 tests passing across monorepo (100% green).

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
JWT_SECRET=<SECURE_RANDOM_JWT_SECRET_32_CHARS>
OWNER_SEED_EMAIL=owner@example.com
OWNER_SEED_PASSWORD=<OWNER_SEED_PASSWORD>
UPLOAD_DIR=./uploads

# Platform Admin Seed Credentials
ADMIN_SEED_EMAIL=admin@example.com
ADMIN_SEED_PASSWORD=<ADMIN_SEED_PASSWORD>

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

## Phase 4A Features Overview

### 1. Customer & Owner Notifications
- **Customer Pickup Modal:** When an order transitions to `completed`, Socket.IO emits `order.completed` carrying `queueNumber`. The customer page displays an instant pickup modal: *"Your print is ready. Please collect it from the counter. Queue number #<n>"*.
- **Desktop Notifications:** If permitted, a desktop browser notification is displayed. Permission is requested explicitly on a user button click ("Notify me when ready"), never on page load.
- **Owner Alerts Banner:** Listen to `owner.alert` over Socket.IO and displays persistent alerts for job failures, printer offline heartbeats, and paper-out states. Alerts can be dismissed and marked read in MongoDB (`PATCH /api/owner/shops/:id/alerts/:alertId/read`).

### 2. Owner Performance Analytics & CSV Export
- **Financial & Operational Analytics:** `GET /api/owner/shops/:id/analytics?from=&to=` computes gross collections, total refunds, average turnaround time (paid to print complete), failure rate, and daily revenue chart series.
- **Frontend Analytics Tab:** 30-day interactive revenue SVG chart, KPI cards, and date filtering.
- **CSV Injection-Protected Export:** `GET /api/owner/shops/:id/orders.csv` streams order history with leading formula characters (`=`, `+`, `-`, `@`) escaped with `'` to prevent spreadsheet code injection.

### 3. Super-Admin Portal (`/admin`)
- **Access Control:** Protected by `requireAdmin` middleware. Blocks unauthenticated users and regular shop owners (`403 Forbidden`). Suspended users are locked out.
- **Platform Management:**
  - **Shops:** Inspect all platform shops, monitor presence, and toggle shop status (`active` <-> `suspended`). Suspended shops are hidden from customers (`404`) and cannot accept orders (`400`).
  - **Orders & Audit Timeline:** Browse all platform orders with search/filter, and inspect the chronological `OrderEvent` audit timeline (draft -> payment -> queued -> printing -> completed -> retention purge).
  - **Financials:** Platform-wide gross payments, refunds, and net revenue retained.
  - **Users & RBAC:** Manage user roles (`owner` <-> `admin`) and suspension flags. Admins cannot demote or suspend themselves (`400 Bad Request`).
  - **Audit Logging:** Every admin mutation writes an immutable `AdminAction` audit trail record.
- **Platform Super-Admin Seed:**
  - Email: `admin@example.com` (configured via `ADMIN_SEED_EMAIL`)
  - Password: `<ADMIN_SEED_PASSWORD>` (configured via `ADMIN_SEED_PASSWORD`)

### 4. Scheduled File Retention & Worker Separation
- **Privacy & Storage Retention:** Completed order file bytes are deleted immediately upon completion or after 24h for cancelled/draft orders. Sets `OrderFile.deletedAt` and logs `file_retention_deleted` `OrderEvent`. Signed download URLs for purged files return `410 Gone`. Order records and totals are preserved for accounting.
- **Dedicated Worker Process:** Separated from API server into `server/src/worker.js`. Runs:
  - Agent lease sweeper every 60 seconds (auto-requeuing dead jobs).
  - Retention file purge every 10 minutes.
  - Start with: `npm --prefix server run start:worker` (or `npm --prefix server run dev:worker`).

### 5. Production Security Hardening
- **Secrets Validation:** `validateProductionSecrets()` prevents server boot in production if default or weak secrets are detected.
- **CORS Allowlist:** Rejects unauthorized cross-origin requests.
- **Rate Limiting:** Distributed Redis-backed rate limiting on auth (10 req/15min), payments, and file uploads.
- **Helmet CSP:** Configured to permit Razorpay checkout iframe and Socket.IO connections.

---

## Phase 4B Features Overview

### Stage 1: Verification & Security Cleanup
- **Credential & Default Secret Eradication:** All known default passwords and credentials removed from source and docs. Seed scripts require environment variables (`OWNER_SEED_PASSWORD`, `ADMIN_SEED_PASSWORD`) and are fully idempotent without overwriting existing credentials.
- **Pre-commit / CI Secret Scanner:** `scripts/check-secrets.sh` (Bash) and `scripts/check-secrets.ps1` (PowerShell) scan all tracked and untracked files for forbidden default credential patterns.
- **Centralized Environment Validator:** `server/src/config/env.js` uses **Zod** to validate every environment variable at boot, reporting detailed errors for missing or weak configuration.
- **End-to-End Live Smoke Test Script:** `scripts/smoke/smoke-test.js` tests real database connectivity, Redis, owner login, PDF upload, draft order creation, payment wait/simulation, and Socket.IO events (`job.queued`, `queue.updated`).
- **Hardware Verification Log:** `docs/verification_log.md` contains the 10-item checklist table for physical and virtual printer verification.

### Stage 2: Containerization & CI/CD Pipeline
- **Backend Dockerfile (`server/Dockerfile`):** Multi-stage build based on `node:20-alpine`, non-root `node` user, production dependencies only, with integrated `/health` `HEALTHCHECK`.
- **Frontend Dockerfile & Nginx (`client/Dockerfile` & `client/nginx.conf`):** Multi-stage build producing static Vite assets served via `nginx:alpine` with SPA routing (`try_files $uri $uri/ /index.html;`), reverse proxy for `/api/` and `/socket.io/`, and HTTP security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).
- **Docker Compose Orchestration (`docker-compose.yml`):** Multi-container stack (`mongo`, `redis`, `api`, `worker`, `web`) with volume persistence and health dependency chains. Reads `.env.docker` (configured via `.env.docker.example`).
- **GitHub Actions CI/CD (`.github/workflows/ci.yml`):** Runs secret verification, shared package tests, backend tests against MongoDB & Redis services, client build, .NET 8 agent tests on Windows runner, and Docker build checks with npm and NuGet caching.
- **Deployment Guide (`docs/deployment.md`):** Complete operations guide detailing local Docker deployment, cloud topologies (Railway, Render, Atlas, Upstash, Cloudflare R2), and Windows agent setup on counter hardware.

---

## Stage-by-Stage Verification Guide

Follow these steps to verify each subsystem of EasyPrint:

### 1. Verify Secret Hygiene
Scan the repository for any forbidden default passwords:
```bash
# Linux / macOS
chmod +x scripts/check-secrets.sh && ./scripts/check-secrets.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/check-secrets.ps1
```

### 2. Verify Health Check Endpoint
With MongoDB and Redis running:
```bash
curl http://localhost:5000/health
# Returns HTTP 200 with JSON:
# { "status": "healthy", "services": { "database": "connected", "redis": "connected", "worker": "healthy" } }
```

### 3. Run Live Smoke Test Script
Executes an end-to-end transaction against live services:
```bash
node scripts/smoke/smoke-test.js
```

### 4. Run Automated Test Suites
Run the full 100-test suite across the monorepo:
```bash
# 1. Shared Engine Tests (9 tests)
npm --prefix shared test

# 2. Phase 1 Customer Web App & File Processing (6 tests)
node --test server/test/phase1_e2e.test.js

# 3. Phase 2 Owner Auth, Live FIFO Queue & Capacity Limit (7 tests)
node --test server/test/phase2_e2e.test.js

# 4. Phase 3A Razorpay Payments & Windows Agent Server API (11 tests)
node --test server/test/phase3a_e2e.test.js

# 5. Phase 3B Windows Agent Server Leases & Sweeper (6 tests)
node --test server/test/phase3b_server.test.js

# 6. Phase 4A Notifications, Analytics, Admin, Retention & Hardening (12 tests)
node --test server/test/phase4a.test.js

# 7. Phase 4B Seed Idempotency, Env Validation, Health & Docker (13 tests)
node --test server/test/phase4b.test.js

# Or run all server suites in one command (55 tests)
npm --prefix server test

# 8. Windows Agent .NET 8 xUnit Suite (36 tests)
dotnet test windows-agent/EasyPrint.Agent.Tests/EasyPrint.Agent.Tests.csproj --no-restore
```

### 5. Local Docker Compose Verification
```bash
# Copy docker environment reference
cp .env.docker.example .env.docker

# Start containerized services
docker compose up -d --build

# Inspect service statuses
docker compose ps
```
*(Note: If testing on a host without the Docker CLI installed, review `docker-compose.yml` and `server/test/phase4b.test.js` where Docker execution is logged as `NOT RUN`)*.

---

**Total Test Count:** **100 tests passing** (100% green). All tests execute against real MongoDB and Redis instances.
