using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using EasyPrint.Agent.Config;
using EasyPrint.Agent.Models;
using EasyPrint.Agent.Services;
using Serilog;

namespace EasyPrint.Agent.UI;

public class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _notifyIcon;
    private readonly ToolStripMenuItem _statusMenuItem;
    private readonly ToolStripMenuItem _currentJobMenuItem;
    private readonly ToolStripMenuItem _pauseMenuItem;
    private readonly AgentConfig _config;
    private readonly HttpApiClient _apiClient;
    private readonly JobPipeline _pipeline;
    private readonly SocketListener _socketListener;
    private readonly JournalService _journalService;

    private readonly Icon _greenIcon;
    private readonly Icon _amberIcon;
    private readonly Icon _redIcon;

    private readonly System.Windows.Forms.Timer _heartbeatTimer;
    private readonly System.Windows.Forms.Timer _pollTimer;
    private bool _isPaused = false;

    public TrayApplicationContext(
        AgentConfig config,
        HttpApiClient apiClient,
        JobPipeline pipeline,
        SocketListener socketListener,
        JournalService journalService)
    {
        _config = config;
        _apiClient = apiClient;
        _pipeline = pipeline;
        _socketListener = socketListener;
        _journalService = journalService;

        _greenIcon = CreateStatusIcon(Color.FromArgb(34, 197, 94));  // Emerald Green
        _amberIcon = CreateStatusIcon(Color.FromArgb(245, 158, 11)); // Amber
        _redIcon = CreateStatusIcon(Color.FromArgb(239, 68, 68));    // Rose Red

        var contextMenu = new ContextMenuStrip();

        _statusMenuItem = new ToolStripMenuItem("Status: Initializing...") { Enabled = false, Font = new Font("Segoe UI", 9, FontStyle.Bold) };
        _currentJobMenuItem = new ToolStripMenuItem("Active Job: None") { Enabled = false };

        _pauseMenuItem = new ToolStripMenuItem("Pause Agent", null, OnPauseClicked);
        var openLogsItem = new ToolStripMenuItem("Open Log Folder", null, OnOpenLogsClicked);
        var repairItem = new ToolStripMenuItem("Re-Pair Agent...", null, OnRepairClicked);
        var quitItem = new ToolStripMenuItem("Exit", null, OnQuitClicked);

        contextMenu.Items.Add(_statusMenuItem);
        contextMenu.Items.Add(_currentJobMenuItem);
        contextMenu.Items.Add(new ToolStripSeparator());
        contextMenu.Items.Add(_pauseMenuItem);
        contextMenu.Items.Add(openLogsItem);
        contextMenu.Items.Add(repairItem);
        contextMenu.Items.Add(new ToolStripSeparator());
        contextMenu.Items.Add(quitItem);

        _notifyIcon = new NotifyIcon
        {
            Icon = _amberIcon,
            Text = "EasyPrint Printing Agent",
            ContextMenuStrip = contextMenu,
            Visible = true
        };

        // Wire up pipeline events
        _pipeline.OnJobRunningChanged += isRunning =>
        {
            UpdateTrayState();
        };

        _pipeline.OnJobProgress += (orderNumber, progress) =>
        {
            _currentJobMenuItem.Text = $"Active: {orderNumber} ({progress}%)";
            UpdateTrayState();
        };

        _pipeline.OnJobAlert += (title, message) =>
        {
            _notifyIcon.ShowBalloonTip(5000, title, message, ToolTipIcon.Warning);
            UpdateTrayState();
        };

        _socketListener.OnConnected += () => UpdateTrayState();
        _socketListener.OnDisconnected += () => UpdateTrayState();

        // Heartbeat timer (every 30s)
        _heartbeatTimer = new System.Windows.Forms.Timer { Interval = _config.HeartbeatIntervalSeconds * 1000 };
        _heartbeatTimer.Tick += async (s, e) => await SendHeartbeatAsync();
        _heartbeatTimer.Start();

        // Polling fallback timer (every 15s)
        _pollTimer = new System.Windows.Forms.Timer { Interval = _config.PollIntervalSeconds * 1000 };
        _pollTimer.Tick += async (s, e) =>
        {
            if (!_isPaused && (!_socketListener.IsConnected || !_pipeline.IsBusy))
            {
                await _pipeline.TryProcessNextJobAsync();
            }
        };
        _pollTimer.Start();

        // Run recovery check on active journal entries
        _ = Task.Run(RunStartupRecoveryAsync);

        // Start socket connection
        _ = _socketListener.StartAsync();

        UpdateTrayState();
    }

    private void UpdateTrayState()
    {
        if (_pipeline.IsBusy)
        {
            _notifyIcon.Icon = _amberIcon;
            _statusMenuItem.Text = "Status: Printing...";
            return;
        }

        var (printerStatus, printerError) = PrinterManager.GetPrinterStatus(_config.PrinterName);

        if (!_socketListener.IsConnected)
        {
            _notifyIcon.Icon = _redIcon;
            _statusMenuItem.Text = "Status: Disconnected";
            _currentJobMenuItem.Text = "Active Job: None";
        }
        else if (printerStatus != "ready")
        {
            _notifyIcon.Icon = _amberIcon;
            _statusMenuItem.Text = $"Status: {printerError ?? "Printer Issue"}";
        }
        else
        {
            _notifyIcon.Icon = _greenIcon;
            _statusMenuItem.Text = _isPaused ? "Status: Paused" : "Status: Ready";
            _currentJobMenuItem.Text = "Active Job: None";
        }
    }

    private async Task SendHeartbeatAsync()
    {
        var (printerStatus, printerError) = PrinterManager.GetPrinterStatus(_config.PrinterName);
        var req = new HeartbeatRequest
        {
            PrinterStatus = printerStatus,
            PrinterError = printerError,
            AgentVersion = "1.0.0"
        };
        await _apiClient.SendHeartbeatAsync(req);
    }

    private async Task RunStartupRecoveryAsync()
    {
        try
        {
            var activeJobs = _journalService.GetActiveEntries();
            foreach (var entry in activeJobs)
            {
                Log.Information("[Recovery] Reconciling unfinished job {JobId} ({OrderNumber})", entry.JobId, entry.OrderNumber);
                var serverStatus = await _apiClient.GetJobStatusAsync(entry.JobId);
                var spoolerInfo = PrinterManager.GetSpoolerJob(_config.PrinterName, entry.DocumentName);
                bool isPresentInSpooler = spoolerInfo != null;

                var action = RecoveryService.DecideRecoveryAction(serverStatus?.Status, isPresentInSpooler);

                switch (action)
                {
                    case RecoveryAction.MarkDoneLocally:
                        Log.Information("[Recovery] Job {JobId} marked done locally based on server status", entry.JobId);
                        _journalService.MarkJobDone(entry.JobId);
                        break;

                    case RecoveryAction.ResumeMonitoring:
                        Log.Information("[Recovery] Resuming spooler monitoring for {Doc}", entry.DocumentName);
                        break;

                    case RecoveryAction.ReportFailed:
                        Log.Warning("[Recovery] Job {JobId} lost after restart. Reporting failure to server.", entry.JobId);
                        await _apiClient.UpdateJobStatusAsync(entry.JobId, new StatusUpdateRequest
                        {
                            Status = "failed",
                            ErrorMessage = "Spooler job lost after restart",
                            IdempotencyKey = entry.IdempotencyKey
                        });
                        _journalService.MarkJobFailed(entry.JobId);
                        break;
                }
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "[Recovery] Exception during startup recovery: {Message}", ex.Message);
        }
    }

    private void OnPauseClicked(object? sender, EventArgs e)
    {
        _isPaused = !_isPaused;
        _pauseMenuItem.Text = _isPaused ? "Resume Agent" : "Pause Agent";
        UpdateTrayState();
    }

    private void OnOpenLogsClicked(object? sender, EventArgs e)
    {
        string logDir = Path.Combine(SecurityUtil.GetAppDataFolder(), "logs");
        if (Directory.Exists(logDir))
        {
            Process.Start(new ProcessStartInfo("explorer.exe", logDir) { UseShellExecute = true });
        }
        else
        {
            MessageBox.Show("No log files generated yet.", "EasyPrint Logs", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    private void OnRepairClicked(object? sender, EventArgs e)
    {
        var form = new PairingForm(_config);
        form.ShowDialog();
        if (form.IsPairedSuccessfully)
        {
            _ = _socketListener.StartAsync();
            UpdateTrayState();
        }
    }

    private void OnQuitClicked(object? sender, EventArgs e)
    {
        if (_pipeline.IsBusy)
        {
            var result = MessageBox.Show(
                "A print job is currently running. Exiting now may interrupt printing. Are you sure you want to quit?",
                "Confirm Exit",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning
            );
            if (result != DialogResult.Yes)
            {
                return;
            }
        }

        _notifyIcon.Visible = false;
        _heartbeatTimer.Stop();
        _pollTimer.Stop();
        ExitThread();
    }

    private static Icon CreateStatusIcon(Color circleColor)
    {
        using var bitmap = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            using var brush = new SolidBrush(circleColor);
            g.FillEllipse(brush, 4, 4, 24, 24);
            using var pen = new Pen(Color.White, 2);
            g.DrawEllipse(pen, 4, 4, 24, 24);
        }
        IntPtr hIcon = bitmap.GetHicon();
        return Icon.FromHandle(hIcon);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _notifyIcon.Dispose();
            _greenIcon.Dispose();
            _amberIcon.Dispose();
            _redIcon.Dispose();
            _heartbeatTimer.Dispose();
            _pollTimer.Dispose();
        }
        base.Dispose(disposing);
    }
}

