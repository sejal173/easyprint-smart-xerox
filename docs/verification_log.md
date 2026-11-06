# EasyPrint — Phase 3B Windows Printing Agent Verification Log

This document serves as the formal manual verification log for the **EasyPrint Windows Background Printing Agent (C# / .NET 8)**.
Operators and testers running the 10-item Phase 3B manual testing checklist record their hardware, driver configurations, and live physical/virtual print results here.

> [!NOTE]
> All result columns are intentionally blank until physical or virtual printer verification is conducted by the operator on target Windows hardware.

---

## Verification Records

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

- **Host Machine OS**: 
- **.NET Desktop Runtime Version**: 
- **EasyPrint Server Version**: 
- **Printer Hardware Tested**: 
- **Verified By**: 

