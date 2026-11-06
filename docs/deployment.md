# EasyPrint — Deployment & Operations Guide

This guide covers deployment architectures, local container orchestration with Docker Compose, cloud infrastructure configurations, production readiness checklists, and the operational lifecycle of the EasyPrint Smart Xerox Automation platform.

---

## 1. System Architecture Overview

EasyPrint consists of distributed, specialized components designed for speed, resilience, and secure physical printing:

```
                  +-----------------------------------+
                  |   Customer Mobile / Desktop Web   |
                  |     (React 18 + Vite / Nginx)     |
                  +-----------------+-----------------+
                                    | HTTPS / WSS
                                    v
+------------------+      +-------------------+      +------------------+
|   MongoDB Atlas  |<---->|   Backend API     |<---->|    Redis Queue   |
|   (Mongoose ODM) |      | (Express + Socket)|      |   (BullMQ 5.8)   |
+------------------+      +---------+---------+      +--------+---------+
                                    |                         |
                                    | Signed S3 URLs          | BullMQ Jobs
                                    v                         v
+------------------+      +-------------------+      +------------------+
|  Cloudflare R2 / |      |  Windows Agent    |      | Background Worker|
|  AWS S3 Storage  |<====>| (.NET 8 WinForms) |      | (File Cleanup &  |
+------------------+      +---------+---------+      |  Queue Sweeper)  |
                                    | Direct Spooler +----+-------------+
                                    v
                          [ Physical Printer ]
```

> [!IMPORTANT]
> **Windows Agent Containerization Notice:**
> The EasyPrint Windows Printing Agent (`windows-agent/EasyPrint.Agent`) is **NOT** containerized. It runs as a native Windows desktop tray process on the shop counter PC. This is because container runtimes (such as Linux containers or Windows Server core containers) cannot interface with desktop interactive sessions, local USB/LAN printer drivers, or the physical Windows Print Spooler (`System.Printing.PrintQueue`).

---

## 2. Local Container Orchestration (Docker Compose)

The repository provides a complete containerized stack featuring MongoDB, Redis, the Express API, the BullMQ worker, and the Nginx web client.

### Prerequisites
- Docker Engine 24.0+ & Docker Compose v2.20+
- At least 4GB of available RAM

### Quickstart Steps

1. **Clone and Navigate:**
   ```bash
   cd easyprint-smart-xerox
   ```

2. **Configure Docker Environment:**
   Copy the reference environment file:
   ```bash
   cp .env.docker.example .env.docker
   ```
   Edit `.env.docker` and ensure `JWT_SECRET` is set to a secure, random string (at least 32 characters).

3. **Launch All Services:**
   ```bash
   docker compose up -d --build
   ```

4. **Verify Service Health:**
   ```bash
   docker compose ps
   ```
   All five services (`easyprint-mongo`, `easyprint-redis`, `easyprint-api`, `easyprint-worker`, `easyprint-web`) will report `healthy` or `running`.

5. **Seed Initial Shop Owner & Admin Data (Optional):**
   ```bash
   docker compose exec api npm run seed
   ```

6. **Access Web Interfaces:**
   - **Customer Web App:** [http://localhost](http://localhost)
   - **Owner Portal:** [http://localhost/owner/login](http://localhost/owner/login)
   - **Backend Health Check:** [http://localhost:5000/health](http://localhost:5000/health) or [http://localhost/health](http://localhost/health)

7. **Inspect Service Logs:**
   ```bash
   # Follow API and worker logs
   docker compose logs -f api worker
   ```

8. **Shut Down Stack:**
   ```bash
   docker compose down
   ```
   *(To wipe database and queue volumes, append `-v`)*.

---

## 3. Cloud Deployment Options

### A. Backend API & Background Worker
- **Platform Recommendations:** Railway, Render, AWS ECS Fargate, or DigitalOcean App Platform.
- **API Service:**
  - Build command: Dockerfile (`server/Dockerfile`) or Node.js build (`npm ci && npm --prefix server run start`).
  - Minimum resources: 512 MB RAM, 0.5 vCPU.
  - Expose port `5000` (or dynamic `$PORT`).
- **Worker Service:**
  - Same Docker image or codebase as API.
  - Run command: `npm --prefix server run start:worker`.
  - Scalability: 1 worker instance per deployment (job concurrency is managed via Redis shop queues).

### B. Managed Database & Queue
- **MongoDB Atlas:**
  - Provision an M0 (free tier) or M10+ replica set.
  - Whitelist cloud hosting IP ranges or allow `0.0.0.0/0` with strong SCRAM authentication.
  - Connection URI format: `mongodb+srv://<user>:<password>@cluster0.mongodb.net/easyprint?retryWrites=true&w=majority`.
- **Redis Queue (BullMQ):**
  - Provision via Upstash Redis, Redis Cloud, or Railway Redis.
  - Connection URI format: `rediss://default:<password>@<host>:<port>`.

### C. Private Cloud Object Storage
- **Cloudflare R2 or AWS S3:**
  - Set `STORAGE_DRIVER=r2` or `s3`.
  - EasyPrint generates pre-signed PUT URLs for direct browser uploads and pre-signed GET URLs (15-minute expiry) for Windows agent downloads.
  - Buckets must remain strictly **Private** (no public bucket policy).
  - CORS Configuration:
    ```json
    [
      {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["PUT", "GET"],
        "AllowedOrigins": ["https://yourdomain.com"],
        "ExposeHeaders": ["ETag"]
      }
    ]
    ```

### D. Frontend Web Client
- **Platform Recommendations:** Vercel, Netlify, Cloudflare Pages, or AWS S3 + CloudFront.
- **Build Configuration:**
  - Build command: `npm --prefix client run build`
  - Output directory: `client/dist`
  - Single Page Application (SPA) routing: configure rewrite rule to redirect `/*` to `/index.html`.

---

## 4. Windows Printing Agent Installation (Shop Counter PC)

The Windows Agent runs as a background tray application directly on the computer connected to the printer:

1. **Build / Publish Binary:**
   On a development workstation with .NET 8 SDK:
   ```powershell
   cd windows-agent/EasyPrint.Agent
   dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ../publish
   ```
2. **Deploy to Shop PC:**
   - Copy `EasyPrint.Agent.exe` to `C:\Program Files\EasyPrint\` or user profile.
   - Run `EasyPrint.Agent.exe`.
3. **Shop Pairing:**
   - On the first run, the agent prompts for:
     - **Server URL:** e.g., `https://api.easyprint.com`
     - **Device Pairing Token:** 32-byte hexadecimal token generated from the Owner Dashboard (`/owner/shops/:id/printers`).
   - The token is hashed on the server and encrypted locally using **Windows DPAPI** in `%LOCALAPPDATA%\EasyPrint\agent.dat`.
4. **Printer Selection:**
   - Right-click the green system tray icon -> Select Printer -> choose target physical or virtual printer.
5. **Autostart:**
   - Place a shortcut to `EasyPrint.Agent.exe` in `shell:startup` so the agent starts automatically upon Windows login.

---

## 5. Environment Variables Reference

| Variable | Description | Required | Example |
| :--- | :--- | :---: | :--- |
| `NODE_ENV` | Runtime environment (`development`, `test`, `production`) | Yes | `production` |
| `PORT` | HTTP server port | No | `5000` |
| `CLIENT_URL` | Trusted CORS origin for web client | Yes | `https://print.easyprint.com` |
| `MONGODB_URI` | MongoDB connection connection string | Yes | `mongodb+srv://...` |
| `REDIS_URL` | Redis instance connection string | Yes | `rediss://default:...` |
| `JWT_SECRET` | Secret key used to sign session cookies (min 32 chars) | Yes | `<SECURE_RANDOM_SECRET>` |
| `STORAGE_DRIVER` | File storage adapter (`local`, `s3`, `r2`) | Yes | `r2` |
| `S3_ENDPOINT` | Custom endpoint (required for Cloudflare R2) | R2 only | `https://<account_id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | S3 or R2 bucket name | S3/R2 | `easyprint-production-files` |
| `AWS_ACCESS_KEY_ID` | Storage access key credentials | S3/R2 | `<ACCESS_KEY_ID>` |
| `AWS_SECRET_ACCESS_KEY` | Storage secret credentials | S3/R2 | `<SECRET_ACCESS_KEY>` |
| `RAZORPAY_KEY_ID` | Razorpay Merchant Key ID | Production | `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay Merchant Secret | Production | `<RAZORPAY_SECRET>` |
| `RAZORPAY_WEBHOOK_SECRET` | Secret used to verify incoming Razorpay webhooks | Production | `<WEBHOOK_SECRET>` |
| `RETENTION_HOURS` | Hours after order completion before file deletion | No | `24` (default) |
| `AGENT_LEASE_SECONDS` | Lease timeout duration before job requeue | No | `300` (default) |

---

## 6. Production Readiness Checklist

Before going live with real customer transactions and physical printing:

- [ ] **Enforce HTTPS Everywhere:** Ensure all traffic to API, Web Client, and WebSockets is TLS 1.3 encrypted.
- [ ] **Secure Cookies:** Verify `NODE_ENV=production` is set so auth cookies have `Secure`, `HttpOnly`, and `SameSite=Lax`.
- [ ] **Secret Hygiene:** Ensure default secrets (e.g. `<OWNER_SEED_PASSWORD>`, `<ADMIN_SEED_PASSWORD>`) are never present in configuration or source code.
- [ ] **Razorpay KYC & Webhooks:**
  - Complete merchant onboarding on Razorpay.
  - Switch `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` from test mode (`rzp_test_`) to live mode (`rzp_live_`).
  - Register webhook URL `https://api.yourdomain.com/api/payments/webhook` listening for `payment.captured` and `payment.failed`.
- [ ] **File Lifecycle Policy:** Verify the BullMQ worker runs 24/7 to prune uploaded customer files after the retention window (`RETENTION_HOURS`).
- [ ] **Database Backups:** Configure MongoDB Atlas automated snapshots with continuous backup and point-in-time recovery.
- [ ] **Rate Limiting:** Ensure Redis-backed rate limiters are active on auth (`/api/auth/*`), payments (`/api/payments/*`), and file uploads (`/api/orders/upload`).
- [ ] **Agent Redundancy:** For critical counter shops, configure a secondary spare PC with the EasyPrint Agent paired in offline standby mode.
