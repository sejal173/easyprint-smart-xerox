# EasyPrint API Reference (Phases 1, 2, 3A & 3B)

Base URL: `http://localhost:5000/api`

---

## 1. Authentication (`/api/auth`)

### Register Owner
- **POST** `/auth/register`
- **Body:** `{ "name": "Rajesh Sharma", "email": "owner@example.com", "password": "<OWNER_PASSWORD>" }`
- **Response (201):** Sets `token` httpOnly cookie.

### Login Owner
- **POST** `/auth/login`
- **Body:** `{ "email": "owner@example.com", "password": "<OWNER_PASSWORD>" }`
- **Response (200):** Sets `token` httpOnly cookie (7 days expiry).

### Logout
- **POST** `/auth/logout`
- **Response (200):** Clears authentication cookie.

### Get Current User Profile
- **GET** `/auth/me`
- **Headers/Cookie:** `Cookie: token=...` or `Authorization: Bearer <token>`
- **Response (200):** Returns authenticated user profile.

---

## 2. Owner Shop Management (`/api/owner/shops`)

*All routes require owner authentication (`requireAuth`, `requireOwner`). Other owners' shops return 404.*

### Create Shop
- **POST** `/owner/shops`
- **Body:** `{ "name": "Alpha Xerox Center", "address": "...", "phone": "...", "priceSettings": { ... }, "maxQueue": 100 }`

### List Owner Shops
- **GET** `/owner/shops`

### Get / Update Shop Profile
- **GET** `/owner/shops/:id`
- **PUT** `/owner/shops/:id`

### Toggle Shop Status (Online / Offline)
- **PATCH** `/owner/shops/:id/status`
- **Body:** `{ "isOnline": false }`
- **Emits:** `shop.status` to room `shop:<id>`

### Manage Printers
- **GET** `/owner/shops/:id/printers`
- **POST** `/owner/shops/:id/printers`: Only one printer can be `isDefault: true`.
- **PUT** `/owner/shops/:id/printers/:printerId`
- **DELETE** `/owner/shops/:id/printers/:printerId`

### QR Code & Standee
- **GET** `/owner/shops/:id/qr`: Returns `{ publicUrl, pngDataUrl }`.
- **GET** `/owner/shops/:id/qr/download`: Streams PNG image with `Content-Disposition: attachment`.

### Live FIFO Queue
- **GET** `/owner/shops/:id/queue?status=queued`
- **Sorted by:** `paidAt asc`, `queueNumber asc`, `createdAt asc` (deterministic tie-breaking).

### Cancel Order & Issue Refund
- **POST** `/owner/shops/:id/orders/:orderNumber/cancel`
- **Behavior:**
  - Atomic check: If order is `printing` or `completed`, rejects with HTTP 409 Conflict.
  - Removes BullMQ queue job.
  - If order was paid: initiates Razorpay refund, sets `Payment.status = 'refunded'`, and transitions order to `refunded`. If refund gateway fails, sets `refund_pending`.
  - If unpaid: transitions to `cancelled`.
  - Decrements Redis active queue counter.
  - Emits `order.status` and `queue.updated`.

### Retry Failed Job
- **POST** `/owner/shops/:id/orders/:orderNumber/retry`
- **Behavior:** Resets `attemptCount: 0`, transitions `PrintJob` and `Order` to `queued`, re-enqueues to BullMQ, and emits live updates.

### Pair Windows Background Printing Agent
- **POST** `/owner/shops/:id/agent-token`
- **Body (optional):** `{ "name": "Main Shop LaserJet Agent" }`
- **Response (201):**
```json
{
  "success": true,
  "message": "Agent token generated successfully. Store this token securely; it cannot be retrieved again.",
  "token": "4f9d2a8b...64_hex_chars_plaintext_returned_once",
  "agentDevice": {
    "id": "...",
    "name": "Main Shop LaserJet Agent",
    "lastHeartbeatAt": "...",
    "printerStatus": "ready"
  }
}
```
*Plaintext token is never stored in the database. Only its SHA-256 hash is persisted.*

---

## 3. Razorpay Payments (`/api/payments`)

*Owner-free, public endpoints. Rate-limited to 60 req / 15 min.*

### Create Razorpay Order
- **POST** `/payments/orders`
- **Body:** `{ "orderNumber": "EP-261106-0001" }`
- **Behavior:**
  - Recomputes total amount authoritatively on server using `@easyprint/shared`.
  - Validates shop is active and online.
  - Creates Razorpay order in INR (amount in paise).
  - Transitions order to `pending_payment` and records `razorpayOrderId`.
- **Response (200):**
```json
{
  "success": true,
  "keyId": "rzp_test_...",
  "razorpayOrderId": "order_MN6b9...",
  "amount": 2000,
  "currency": "INR",
  "orderNumber": "EP-261106-0001"
}
```

### Verify Payment Signature
- **POST** `/payments/verify`
- **Body:**
```json
{
  "razorpay_order_id": "order_MN6b9...",
  "razorpay_payment_id": "pay_MN6c1...",
  "razorpay_signature": "4a5c9..."
}
```
- **Behavior:**
  - Cryptographically verifies HMAC-SHA256 signature against `RAZORPAY_KEY_SECRET` using `timingSafeEqual`.
  - Calls shared `markOrderPaid` service: assigns sequential daily queue number from `Counter`, creates `PrintJob` in `queued` status, enqueues to BullMQ, and emits Socket.IO updates.

### Webhook
- **POST** `/payments/webhook`
- **Middleware:** Raw body Buffer parser mounted before `express.json()`.
- **Signature:** `X-Razorpay-Signature` verified against raw body using `RAZORPAY_WEBHOOK_SECRET`.
- **Idempotency:** Stores `X-Razorpay-Event-Id` in `WebhookEvent`. Duplicate event IDs return 200 without reprocessing.
- **Events handled:**
  - `payment.captured`: Calls `markOrderPaid`, transitions `Payment` to `paid`.
  - `payment.failed`: Records failed payment, emits `order.status` with `payment_failed` so customer can retry.
  - `refund.processed`: Marks `Payment` and `Order` as `refunded`.

---

## 4. Windows Printing Agent API (`/api/agent`)

*Base path: `/api/agent`. Protected by `requireAgent` middleware (requires `Authorization: Bearer <agentToken>`).*

### Agent Heartbeat
- **POST** `/agent/heartbeat`
- **Body:**
```json
{
  "printerStatus": "ready",
  "printerError": null,
  "agentVersion": "1.0.0"
}
```
- **Behavior:** Updates `lastHeartbeatAt`. Emits `agent.status` to `shop:<id>`. If shop has an agent and heartbeat is older than 90s, public availability reports `OFFLINE`.

### Atomic Job Claim (Next Job in Queue)
- **GET** `/agent/jobs/next`
- **Behavior:**
  - Sweeps expired leases.
  - Atomically finds oldest `queued` `PrintJob` for agent's shop.
  - Transitions to `claimed`, increments `attemptCount`, and sets 5-minute lease (`leaseExpiresAt = now + 5 min`).
  - Returns 200 with job details and signed download URLs. If no queued jobs, returns 204 No Content.

### Renew Job Lease (While Printing)
- **POST** `/agent/jobs/:id/lease`
- **Headers:** `Authorization: Bearer <agentToken>`
- **Body:** `{ "idempotencyKey": "uuid_optional" }`
- **Behavior:**
  - Requires calling agent device to own the job and job to be in `claimed` or `printing` state.
  - Sets `leaseExpiresAt = now + AGENT_LEASE_SECONDS` (default 300s).
  - Returns `200 OK` with `{ success: true, leaseExpiresAt }`.
  - Returns `409 Conflict` if the job is no longer owned by this device or has expired/re-assigned.
  - Returns `404 Not Found` if job belongs to a different shop.

### Reconcile Job Status (Post-Restart Recovery)
- **GET** `/agent/jobs/:id/status`
- **Headers:** `Authorization: Bearer <agentToken>`
- **Behavior:**
  - Used by the Windows agent after unexpected crashes, restarts, or power failures.
  - Confirms server status for a job claimed by this device.
  - Returns `200 OK` with:
  ```json
  {
    "success": true,
    "jobId": "...",
    "orderNumber": "EP-261106-ABCD",
    "status": "printing",
    "attemptCount": 1,
    "spoolerJobId": 1052,
    "leaseExpiresAt": "2026-11-06T12:45:00.000Z"
  }
  ```
  - Returns `404 Not Found` if job does not exist or does not belong to the calling device's shop.

### Update Job Status
- **PATCH** `/agent/jobs/:id/status`
- **Body:**
```json
{
  "status": "printing",
  "spoolerJobId": 1052,
  "errorMessage": null,
  "idempotencyKey": "agent_action_uuid"
}
```
- **Transitions allowed:**
  - `queued` -> `claimed`
  - `claimed` -> `printing`, `failed`, `queued`
  - `printing` -> `completed`, `failed`
- **On Completed:**
  - Computes `sheetCount` and `printDurationSeconds`.
  - Sets Order and Job `completedAt` and status `completed`.
  - Decrements Redis active queue counter.
  - Emits `queue.updated` and `order.status` (`completed`).

### Download Job File
- **GET** `/agent/jobs/:id/file` (requires Agent Bearer token)
- **GET** `/agent/storage-download?key=...&expires=...&sig=...` (signed URL download)

---

## 5. Socket.IO Real-Time Channels

- Client joins: `join:shop` (`shop:<id>`), `join:order` (`order:<orderNumber>`).
- Agent handshake auth: passes `auth.token` in handshake to automatically join `agent:<id>` and `shop:<shopId>`.
- Server emits:
  - `queue.updated` -> `{ queueLength, estimatedWaitSeconds, estimatedWaitFormatted }`
  - `order.status` -> `{ orderNumber, status, queuePosition, ordersAhead, eta }`
  - `order.completed` -> `{ orderNumber, queueNumber, status, completedAt }` (drives customer pickup modal)
  - `owner.alert` -> `{ id, type, message, orderNumber, createdAt }` (drives owner error banner & notifications)
  - `job.queued` -> `{ orderNumber, queueNumber, shopId }` (alerts Windows agent to claim job immediately)
  - `agent.status` -> `{ agentId, name, printerStatus, lastHeartbeatAt }`
  - `shop.status` -> `{ shopId, isOnline, status }`

---

## 6. Owner Alerts & Analytics APIs

### List Shop Alerts
- **GET** `/api/owner/shops/:id/alerts`
- Returns persistent alerts for printer jams, paper-out, and failed print jobs.

### Mark Alert as Read
- **PATCH** `/api/owner/shops/:id/alerts/:alertId/read`
- Sets `readAt = new Date()`.

### Shop Performance & Earnings Analytics
- **GET** `/api/owner/shops/:id/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Returns aggregate metrics: gross revenue, total refunds, average turnaround seconds, failure rate, and daily chart series.

### Export Orders as CSV
- **GET** `/api/owner/shops/:id/orders.csv?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Streams CSV export protected against CSV formula injection (prepends `'` to leading `=`, `+`, `-`, `@`).

---

## 7. Super-Admin Management APIs (RBAC: `requireAdmin`)

### List All Platform Shops
- **GET** `/api/admin/shops?status=&search=&page=&limit=`
- Supports filtering by `active` or `suspended` and searching by name, slug, or owner email.

### Update Shop Status
- **PATCH** `/api/admin/shops/:id/status`
- **Body:** `{ "status": "active" | "suspended" }`
- Suspended shops are hidden from customer lookup (`404`) and cannot accept orders (`400`). Writes an immutable `AdminAction` audit record.

### List Platform Orders
- **GET** `/api/admin/orders?shop=&status=&from=&to=&page=&limit=`

### Get Order by Order Number with Audit Timeline
- **GET** `/api/admin/orders/:orderNumber`
- Returns complete order details and chronological `OrderEvent` timeline.

### List Payments & Platform Revenue
- **GET** `/api/admin/payments?status=&page=&limit=`
- Returns payments log and platform financial aggregates (`totalPaid`, `totalRefunded`, `netRevenue`).

### List Platform Users
- **GET** `/api/admin/users?role=&page=&limit=`

### Update User Privileges or Suspension
- **PATCH** `/api/admin/users/:id`
- **Body:** `{ "role": "owner" | "admin", "isSuspended": boolean }`
- Self-suspension and self-demotion are blocked (`400`). Writes an immutable `AdminAction` audit record.

---

## 8. Scheduled File Retention & Worker Process

### File Retention Policy
- File bytes for completed orders and non-active orders older than 24h are deleted from storage.
- Associated `OrderFile.deletedAt` timestamp is set.
- Access to deleted files returns `410 Gone`.
- Order records, financial totals, and audit logs are permanently preserved.

### Background Worker
- Command: `npm --prefix server run start:worker` (`worker.js`).
- Executes:
  - Agent lease sweeper every 60 seconds (requeues expired leases).
  - File retention cleanup every 10 minutes.
