# EasyPrint Windows Printing Agent — Shop Owner Installation Guide

This guide explains how to install, pair, and operate the **EasyPrint Windows Printing Agent** on the shop counter PC connected to your Xerox or commercial printers.

---

## 1. Prerequisites

Before installing the agent, ensure your shop computer meets these requirements:

1. **Windows PC:** Windows 10 (version 1809+) or Windows 11 (64-bit).
2. **Microsoft .NET 8 Desktop Runtime:**
   - Download the [.NET 8 Desktop Runtime (x64)](https://dotnet.microsoft.com/download/dotnet/8.0/runtime).
   - Run the installer and complete the setup.
3. **Connected Printer:**
   - Your Xerox or commercial printer (HP, Canon, Epson, Brother, Ricoh) must be turned on, loaded with paper and toner, and installed as a recognized printer in Windows Settings (`Settings > Bluetooth & devices > Printers & scanners`).
   - For testing without paper, Windows built-in **Microsoft Print to PDF** can also be used.
4. **Internet Access:** Continuous internet connection to communicate with the EasyPrint cloud server via HTTPS and WebSocket.

---

## 2. Generating a Device Pairing Token

1. Open your web browser and log in to the **EasyPrint Shop Owner Dashboard** (`/owner/login`).
2. Navigate to **Shops** > Select your Shop > **Printers & Agent Devices**.
3. Click **Add New Agent Device** or **Pair New PC**.
4. Enter a name for the computer (e.g. `Front Counter PC` or `Shop-Canon-1`).
5. Click **Generate Pairing Token**.
6. **Important:** Copy the 32-byte secret token shown on screen.
   *(This token is displayed only once. If lost, you can revoke it and generate a new one).*

---

## 3. Installing and Running the Agent

1. Download or locate the EasyPrint Agent folder (`windows-agent\publish`).
2. Double-click `EasyPrint.Agent.exe`.
3. The **EasyPrint Agent Pairing Dialog** will appear automatically on first launch:
   - **Server URL:** Enter the web address of your EasyPrint server (for example: `https://print.yourdomain.com` or `http://localhost:5000` for local testing).
   - **Device Token:** Paste the pairing token you copied from the dashboard.
4. Click **Connect & Pair**.
5. Once paired:
   - The token is encrypted using Windows DPAPI and stored securely in `%LOCALAPPDATA%\EasyPrint\agent.dat`.
   - The dialog will close and a printer icon will appear in the Windows taskbar system tray (bottom-right near the clock).

---

## 4. Understanding System Tray Status

Look at the EasyPrint tray icon in the system notification area:

| Icon | Status | Meaning |
| :---: | :--- | :--- |
| 🟢 | **Green (Ready)** | Agent is connected, printer is ready with paper, and waiting for customer orders. |
| 🟡 | **Amber (Warning)** | Printer is offline, paper tray is empty, or the agent is reconnecting to the internet. |
| 🔴 | **Red (Error)** | Authentication failed, device token revoked, or critical hardware error. |

Right-clicking the tray icon reveals options:
- **Status Summary:** Shows what is currently printing and progress percentage.
- **Pause Queue / Resume Queue:** Temporarily stop receiving new print jobs (e.g., when refilling toner or changing paper rolls).
- **Open Logs:** Opens the logs folder in Windows Explorer to review print history or errors.
- **Re-pair Agent:** Clears the stored token so you can connect to a different shop or server.
- **Exit:** Exits the application.

---

## 5. Automatic Startup on Windows Boot

The agent automatically configures itself to start when Windows boots up:
- Registry location: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\EasyPrintAgent`
- This ensures that if the computer restarts after an update or power interruption, printing resumes automatically as soon as the operator logs in to Windows.

---

## 6. How Print Jobs Flow Through Your Shop

```
Customer Uploads & Pays 
        │
        ▼
EasyPrint Cloud Server (BullMQ Queue)
        │
        ├─► Instant Socket.IO Notification
        │
        ▼
EasyPrint Agent on Windows PC
        │
        ├─► 1. Claims Job (Atomic 5-minute Lease)
        ├─► 2. Downloads PDF & Validates Magic Bytes
        ├─► 3. Formats Page Range & Duplex / N-Up Layout
        ├─► 4. Sends to Windows Print Spooler
        ├─► 5. Monitors Spooler (Renews Lease every 60s)
        │
        ▼
Windows Print Spooler ──► Physical Xerox Printer Prints Sheets!
        │
        ▼
EasyPrint Agent Marks Job Complete & Reports Sheet Count / Duration
```

---

## 7. Troubleshooting & FAQ

### Q1: The tray icon is amber and says "Printer Offline".
- Ensure the printer's power cord and USB/Ethernet cable are firmly connected.
- Check Windows **Printers & Scanners** to verify the printer is not in "Use Printer Offline" mode.
- Clear any paper jams or refill empty paper trays.

### Q2: A customer uploaded a multi-page document, but only pages 2, 4, 6 printed.
- Check the order options in the dashboard. The customer may have selected "Even Pages only" or a custom page range (e.g. `2, 4, 6`).

### Q3: How do I change the default printer used by EasyPrint?
- By default, EasyPrint uses the Windows Default Printer.
- To lock the agent to a specific printer, open `%LOCALAPPDATA%\EasyPrint\appsettings.json` in Notepad, set `"PrinterName": "Your Printer Name"`, and restart the agent.

### Q4: Where can I find detailed error logs?
- Press `Win + R`, paste `%LOCALAPPDATA%\EasyPrint\logs`, and press Enter.
- Daily log files (`agent-YYYYMMDD.log`) record all job events, timing, and diagnostic details.

