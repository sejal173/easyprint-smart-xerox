# EasyPrint — System Verification & Testing Log

This document serves as the formal verification log for the **EasyPrint Smart Xerox & Monorepo System** (Shared package, Server, Client, Windows Background Printing Agent, and CI).
Automated tests and stack inspections are recorded below. All physical printer test results are preserved for human operator execution on target Windows shop hardware.

---

## 1. Automated Verification & Stack Inspection Records (Steps 1 to 6)

| Step | Date | Command | Result | Output Summary / Note |
| :-: | :---: | :--- | :---: | :--- |
| **1.1** | 2026-11-07 | `npm --prefix shared test` | **PASS** | 9 of 9 unit tests passed (583ms duration). Covers page ranges, odd/even filtering, print pricing, customer wait time, and rolling-average ETA calculations. |
| **1.2** | 2026-11-07 | `npm --prefix server test` | **PASS** | 59 of 59 tests passed across all 6 test suites (Phase 1, 2, 3A, 3B, 4A, 4B) in 118s. Includes payment simulation security guards (6.1–6.4). |
| **1.3** | 2026-11-07 | `npm --prefix client run build` | **PASS** | Vite production bundle compiled 1647 modules successfully in 54.45s (`dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`). |
| **1.4** | 2026-11-07 | `dotnet test windows-agent/EasyPrint.Agent.Tests/EasyPrint.Agent.Tests.csproj --no-restore` | **PASS** | 36 of 36 xUnit tests passed (466ms test duration) on .NET 8.0. |
| **1.5** | 2026-11-07 | `powershell -ExecutionPolicy Bypass -File scripts/check-secrets.ps1` | **PASS** | Zero default secrets or hardcoded passwords found across tracked and untracked files. |
| **1.6** | 2026-11-07 | `bash scripts/check-secrets.sh` | **NOT RUN** | Bash/MSYS CLI not available in standard Windows environment; PowerShell scanner verified clean. |
| **2.1** | 2026-11-07 | `git grep -n "4e8a32f1\|OwnerSecureLocal\|AdminSecureLocal"` | **PASS** | Zero matches for sensitive secrets across repository. |
| **2.2** | 2026-11-07 | `git ls-files .env server/.env client/.env .env.docker appsettings.json publish/ bin/ obj/ uploads/` | **PASS** | Verified sensitive credential files and build artifacts are not tracked by git. |
| **3.1** | 2026-11-07 | `docker --version`, `docker compose version` | **NOT RUN** | Docker Desktop runtime is not installed on this host environment. |
| **3.2** | 2026-11-07 | `docker-compose.yml` & `.dockerignore` audit | **PASS** | Removed obsolete `version: '3.8'` key; verified all services use environment variable substitution (`${VAR}`) from `.env.docker`. `.dockerignore` configured. |
| **4.1** | 2026-11-07 | `node scripts/smoke/smoke-test.js` (simulation OFF) | **PASS** | Steps 1–3 passed against live stack: GET /health (200), owner login, PDF upload & draft order creation. Steps 4–7 report NOT RUN as designed when simulation is OFF without a real Razorpay key. |
| **5.1** | 2026-11-07 | `node scripts/test-webhook.js` | **PASS** | Signed `payment.captured` transitioned order to QUEUED; duplicate delivery was an idempotent no-op; `payment.failed` kept order in `pending_payment`. |
| **6.1** | 2026-11-07 | `git push -u origin main` | **PASS** | Repository pushed cleanly to remote. |

---

## 2. Phase 3B Windows Printing Agent Hardware Checklist

> [!NOTE]
> All result columns in this hardware section are intentionally blank for the human operator to complete on the target Windows counter machine.

| # | Test Case Description | Date | Printer Model | Driver Version / Name | Result (PASS / FAIL / NOT RUN) | Notes & Spooler Job ID |
| :-: | :--- | :---: | :---: | :---: | :---: | :--- |
| **1** | **First Launch & Pairing Dialog**<br>Verify clean startup, DPAPI token encryption in `%LOCALAPPDATA%\EasyPrint\agent.dat`, zero plaintext in logs. | | | | | |
| **2** | **System Tray Icon & 30s Heartbeat**<br>Verify tray icon turns green, `POST /api/agent/heartbeat` fires every 30s, owner dashboard reports `ready`. | | | | | |
| **3** | **Real-Time Job Notification (Socket.IO)**<br>Verify immediate `< 1s` `job.queued` delivery upon customer payment, tray balloon notification, automatic job claim. | | | | | |
| **4** | **Magic Byte Integrity Verification**<br>Verify agent inspects file header (`%PDF-`, PNG, JPEG), rejects spoofed executable/text extensions, marks job `failed`. | | | | | |
| **5** | **Duplex (Two-Sided) Printing**<br>Verify `Sides: Double sided (Duplex)` instructs printer `DuplexVertical`, producing correct two-sided physical output. | | | | | |
| **6** | **Custom Page Range Parsing**<br>Verify custom range syntax (e.g. `1-3, 5, 8-10`) renders only selected pages and skips unrequested pages cleanly. | | | | | |
| **7** | **Odd / Even Page Filtering**<br>Verify filtering logic renders solely odd or even pages matching print configuration. | | | | | |
| **8** | **N-Up Multi-Page Layout (2 & 4 per Sheet)**<br>Verify PDFium composite rendering arranges 2 or 4 pages per sheet with aspect ratio preservation and grid borders. | | | | | |
| **9** | **Active Lease Renewal During Long Print**<br>Verify `POST /api/agent/jobs/:id/lease` sends renewal every 60s while spooler is paused/busy, preventing sweeper requeue. | | | | | |
| **10** | **Crash & Restart Spooler Reconciliation**<br>Verify killing agent during active printing, restarting agent, journal recovery, spooler polling, and deduplicated completion. | | | | | |

---

## Testing Environment Summary

- **Host Machine OS**: Windows 11
- **.NET Desktop Runtime Version**: 8.0.427
- **Node.js Version**: v20+
- **Printer Hardware Tested**: (Pending counter deployment)
- **Verified By**: Automated Verification Suite
