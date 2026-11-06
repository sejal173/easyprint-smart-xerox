# EasyPrint Windows Printing Agent (.NET 8)

The Windows background printing agent runs on the shop owner's PC connected to physical Xerox printers (such as HP LaserJet, Canon imageRUNNER, Epson, etc.).

## Architecture Overview
- **Runtime:** C# / .NET 8 (WinForms / WPF system tray app and Windows Service).
- **Communication:** Secure WebSocket (`wss://`) with fallback HTTP long-polling every 15 seconds.
- **Security:** Shop PC pairs with device token stored using Windows Data Protection API (DPAPI).
- **Rendering:** PDFium for accurate vector page rendering and rasterization.
- **Print Spooler Integration:** `System.Printing` (`PrintQueue` and `PrintSystemJobInfo`) for real-time spooler progress monitoring.
- **Idempotency:** Local SQLite / memory cache of processed job IDs preventing reprinting.

> Activated and tested in **Phase 3**.

