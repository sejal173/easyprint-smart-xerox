# EasyPrint Architecture & System Design

EasyPrint is a production-ready Smart Xerox Automation System designed to automate physical Xerox and copy shop operations.

```
+-------------------------------------------------------------+
|                     Customer Smartphone                     |
|  - Scans Shop QR Code -> /s/:slug                           |
|  - Uploads PDF / JPG / PNG (Magic-byte verified)            |
|  - Configures Print Options (B&W/Color, Duplex, Range, etc.)|
|  - Real-time Server Price Quote Calculation                 |
|  - Live Queue Position & Wait Time (Socket.IO)              |
+------------------------------+------------------------------+
                               |
                               | HTTPS / WSS
                               v
+-------------------------------------------------------------+
|                   EasyPrint Express & Node Server           |
|  - RESTful APIs (Shops, Uploads, Pricing, Orders)           |
|  - Magic-byte file validation & pdf-lib page counting       |
|  - Authoritative Pricing Engine (shared module)             |
|  - Socket.IO live rooms (shop:<id>, order:<orderNumber>)    |
|  - MongoDB Atlas / Local MongoDB Mongoose Models            |
|  - BullMQ FIFO Redis Queue (Phase 2)                        |
|  - Razorpay Webhook & Payment Verification (Phase 3)        |
+------------------------------+------------------------------+
                               |
                               | Secure WSS / Spooler API
                               v
+-------------------------------------------------------------+
|             Windows Background Printing Agent (.NET 8)      |
|  - Runs on Shop PC (Tray App / Windows Service)             |
|  - DPAPI encrypted device token authentication              |
|  - Downloads private files via short-lived signed URLs      |
|  - PDFium vector rendering & page range extraction          |
|  - Windows Print Spooler monitoring (System.Printing)       |
|  - Hardware status & completion heartbeat updates           |
+-------------------------------------------------------------+
```

## Database Schema (MongoDB Mongoose)

1. **User**: Store credentials for shop owners and platform admins.
2. **Shop**: Store shop profile, geo-location, availability status, price settings (`bwPerPage`, `colorPerPage`, `duplexDiscount`, `a3Multiplier`, `glossyPaperSurcharge`), max queue capacity, and configured printers.
3. **ShopQrCode**: Store unique public URL (`/s/:slug`) and PNG data URL for instant counter display or printing.
4. **Order**: Unique order number (`EP-YYMMDD-XXXX`), shop reference, customer phone, lifecycle status (`draft`, `pending_payment`, `queued`, `printing`, `completed`, `failed`, `cancelled`), total amount, detailed breakdown, embedded print options, and queue timestamps.
5. **OrderFile**: Links uploaded files to orders with storage keys, sanitized filenames, true MIME types, detected page counts, and preview URLs.

## Implementation Phases
- **Phase 1 (Completed):** Customer web application, QR codes, upload pipeline with magic byte validation, print options form, shared pricing calculator, and draft order creation in MongoDB.
- **Phase 2:** Shop owner dashboard, online/offline live toggle, BullMQ FIFO queue per shop, 100-order capacity limits, and rolling-average ETA waiting calculator.
- **Phase 3:** Razorpay payment gateway integration, webhook signature verification, and the C#/.NET 8 Windows printing agent with spooler tracking.
- **Phase 4:** Push notifications, analytics dashboard, platform admin panel, automated file cleanup retention, and end-to-end stress tests.

