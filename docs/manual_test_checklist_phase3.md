# EasyPrint — Phase 3B Manual Printing Verification Checklist

This checklist provides a structured 10-item manual verification procedure to validate the **EasyPrint Windows Printing Agent (C# / .NET 8)** on either a physical printer (e.g. HP LaserJet, Canon imageRUNNER) or a virtual printer (**Microsoft Print to PDF**).

---

### Prerequisites
- EasyPrint Backend Server running (`npm --prefix server start` or `node server/src/server.js`) on port 5000.
- MongoDB and Redis instances active.
- EasyPrint Client running (`npm --prefix client run dev`) on port 5173.
- Windows 10/11 x64 PC with .NET 8 Desktop Runtime installed.
- Agent published binary ready at `windows-agent/publish/EasyPrint.Agent.exe`.

---

## 10-Item Verification Checklist

| # | Test Case | Action / Steps | Expected Result | Pass / Fail |
| :-: | :--- | :--- | :--- | :---: |
| **1** | **First Launch & Pairing Dialog** | Delete `%LOCALAPPDATA%\EasyPrint\agent.dat` if existing. Launch `EasyPrint.Agent.exe`. Enter Server URL `http://localhost:5000` and a valid 32-byte token from `/owner/shops/:id/printers`. | Pairing succeeds. Pairing dialog closes. `%LOCALAPPDATA%\EasyPrint\agent.dat` is created and encrypted using DPAPI (plaintext token is never in logs or config). | [ ] |
| **2** | **Tray Icon & Heartbeat Status** | Observe system tray icon in the Windows taskbar. Check Owner Dashboard (`/owner/shops/:id/printers`). | Tray icon displays 🟢 Green. Heartbeat sends every 30s. Owner dashboard shows `Front Counter PC` status as `ready` with live `lastHeartbeatAt`. | [ ] |
| **3** | **Real-Time Job Notification** | Place an order from the customer interface (`http://localhost:5173/shop/quickcopy-central`) and complete payment via Dev or Razorpay test mode. | Within < 1 second of payment, Socket.IO emits `job.queued`. Agent tray displays a balloon notification with order number and begins claiming the job. | [ ] |
| **4** | **Magic Byte Integrity Verification** | Place an order with a renamed `.exe` or `.txt` file pretending to be `.pdf`. | Agent downloads file, inspects header bytes (requires `%PDF-`, PNG, or JPEG header), rejects the spoofed file, updates job to `failed`, and logs the error. | [ ] |
| **5** | **Duplex (Two-Sided) Printing** | Upload a 4-page PDF with option: `Sides: Double sided (Duplex)`. Print to physical duplex printer or virtual printer. | Printer settings receive `Duplex = DuplexVertical`. Job prints on 2 physical sheets (pages 1-2 on sheet 1, pages 3-4 on sheet 2). | [ ] |
| **6** | **Custom Page Range Parsing** | Upload a 10-page document with `Pages: Custom Range: 1-3, 5, 8-10`. | Only pages 1, 2, 3, 5, 8, 9, 10 are rendered and sent to the spooler (7 pages total). Pages 4, 6, 7 are skipped. | [ ] |
| **7** | **Odd / Even Page Filtering** | Upload a 6-page document with option: `Odd/Even: Odd pages only`. | Spooler receives exactly 3 pages: pages 1, 3, 5. | [ ] |
| **8** | **N-Up Multi-Page Layout (2 & 4 per Sheet)** | Upload a 4-page PDF with `Pages Per Sheet: 2`. | Agent composites 2 document pages side-by-side onto each A4 sheet with proper aspect ratio scaling and borders. Total output is 2 sheets (or 1 sheet if duplex). | [ ] |
| **9** | **Active Lease Renewal During Long Print** | Set Windows printer to "Pause Printing" in Windows Spooler settings. Submit a 50-page document order so it remains in `printing` status for > 2 minutes. | Agent sends `POST /api/agent/jobs/:id/lease` every 60s. Job expiry extends on server. Server sweeper never requeues or reassigns the job while lease is maintained. Resume printer to complete. | [ ] |
| **10** | **Crash & Restart Recovery** | While an order is active in the spooler, forcefully terminate `EasyPrint.Agent.exe` via Task Manager (`kill`). Restart `EasyPrint.Agent.exe`. | Agent starts up, loads `%LOCALAPPDATA%\EasyPrint\journal.json`, calls `GET /api/agent/jobs/:id/status`, inspects the Windows spooler, determines whether the spooler job finished, and marks the job complete without reprinting duplicate pages. | [ ] |

---

## Log Verification Procedure

To inspect Serilog diagnostic output during testing:
1. Open Windows File Explorer: `%LOCALAPPDATA%\EasyPrint\logs`
2. Open the latest `agent-YYYYMMDD.log` file.
3. Verify:
   - DPAPI token is never written to logs (only masked or logged as `[REDACTED]`).
   - S3 signed URLs are never written to logs in full.
   - Spooler job submission logs: `[Spooler] Enqueued job EP-<orderNumber>-<jobId> with spooler ID <id>`.
   - Completion logs: `[Pipeline] Job completed in X seconds, sheetCount: Y`.

