using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using EasyPrint.Agent.Config;
using EasyPrint.Agent.Models;
using Serilog;

namespace EasyPrint.Agent.Services;

public class JobPipeline
{
    private readonly AgentConfig _config;
    private readonly HttpApiClient _apiClient;
    private readonly JournalService _journalService;
    private readonly PdfRenderer _pdfRenderer;
    private readonly SemaphoreSlim _concurrencyLock = new(1, 1);

    public event Action<string, int>? OnJobProgress; // (orderNumber, progressPercentage)
    public event Action<string, string>? OnJobAlert;    // (title, message)
    public event Action<bool>? OnJobRunningChanged;    // (isRunning)

    public bool IsBusy => _concurrencyLock.CurrentCount == 0;
    public string? CurrentOrderNumber { get; private set; }

    public JobPipeline(AgentConfig config, HttpApiClient apiClient, JournalService journalService, PdfRenderer pdfRenderer)
    {
        _config = config;
        _apiClient = apiClient;
        _journalService = journalService;
        _pdfRenderer = pdfRenderer;
    }

    public async Task<bool> TryProcessNextJobAsync(CancellationToken ct = default)
    {
        // Enforce concurrency 1
        if (!_concurrencyLock.Wait(0))
        {
            Log.Debug("[Pipeline] Agent busy. Ignoring trigger.");
            return false;
        }

        try
        {
            OnJobRunningChanged?.Invoke(true);
            var job = await _apiClient.GetNextJobAsync(ct);
            if (job == null)
            {
                return false;
            }

            CurrentOrderNumber = job.OrderNumber;
            Log.Information("[Pipeline] Claimed job {JobId} for Order {OrderNumber}", job.Id, job.OrderNumber);
            await ProcessJobAsync(job, ct);
            return true;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "[Pipeline] Error in TryProcessNextJobAsync: {Message}", ex.Message);
            return false;
        }
        finally
        {
            CurrentOrderNumber = null;
            OnJobRunningChanged?.Invoke(false);
            _concurrencyLock.Release();
        }
    }

    private async Task ProcessJobAsync(JobDto job, CancellationToken ct)
    {
        string documentName = $"EP-{job.OrderNumber}-{job.Id}";
        string idempotencyKey = Guid.NewGuid().ToString();
        string tempDir = Path.Combine(SecurityUtil.GetAppDataFolder(), "temp", job.Id);

        _journalService.RecordJobClaimed(job.Id, job.OrderNumber, documentName, idempotencyKey);

        try
        {
            Directory.CreateDirectory(tempDir);

            // Step 2: Download files with retry
            var localFilePaths = new List<string>();
            foreach (var file in job.Files)
            {
                string localPath = Path.Combine(tempDir, file.OriginalName);
                bool downloaded = false;

                for (int attempt = 1; attempt <= _config.MaxAttempts; attempt++)
                {
                    Log.Information("[Pipeline] Downloading {FileName} (Attempt {Attempt}/{Max})", file.OriginalName, attempt, _config.MaxAttempts);
                    downloaded = await _apiClient.DownloadFileAsync(file.DownloadUrl, localPath, file.SizeBytes, ct);
                    if (downloaded) break;

                    await Task.Delay(1000 * attempt, ct);
                }

                if (!downloaded || !File.Exists(localPath))
                {
                    throw new InvalidOperationException($"Failed to download file '{file.OriginalName}' after {_config.MaxAttempts} attempts.");
                }

                // Step 2b: Magic bytes validation
                if (!PdfRenderer.ValidateMagicBytes(localPath, out string detectedMime))
                {
                    throw new InvalidOperationException($"File '{file.OriginalName}' failed magic byte inspection (genuine PDF, PNG, or JPEG required).");
                }

                localFilePaths.Add(localPath);
            }

            _journalService.UpdateJobState(job.Id, "Downloaded");

            // Step 3: Render and composite sheets
            _journalService.UpdateJobState(job.Id, "Rendering");
            var renderedPages = new List<Bitmap>();

            foreach (var filePath in localFilePaths)
            {
                string ext = Path.GetExtension(filePath).ToLowerInvariant();
                if (ext == ".pdf")
                {
                    int totalPages = _pdfRenderer.GetPdfPageCount(filePath);
                    var selectedPages = PageProcessor.ParsePageRange(job.Options.CustomRange, totalPages);
                    selectedPages = PageProcessor.FilterOddEven(selectedPages, job.Options.OddEven);

                    foreach (int pageNum in selectedPages)
                    {
                        var bmp = _pdfRenderer.RenderPage(filePath, pageNum, 300);
                        renderedPages.Add(bmp);
                    }
                }
                else
                {
                    var bmp = _pdfRenderer.RenderImage(filePath, 300);
                    renderedPages.Add(bmp);
                }
            }

            if (renderedPages.Count == 0)
            {
                throw new InvalidOperationException("No valid printable pages extracted for this job.");
            }

            // Step 4: Layout and Sheet Calculation
            bool isDuplex = job.Options.Sides.Equals("double", StringComparison.OrdinalIgnoreCase);
            int sheetCount = PageProcessor.CalculateSheetCount(
                renderedPages.Count,
                job.Options.PagesPerSheet,
                isDuplex,
                job.Options.Copies
            );

            // Compose N-up sheets
            var compositeSheets = ComposeSheets(renderedPages, job.Options.PagesPerSheet);

            // Step 5: Notify Server Transition to Printing
            _journalService.UpdateJobState(job.Id, "Spooling");
            await _apiClient.UpdateJobStatusAsync(job.Id, new StatusUpdateRequest
            {
                Status = "printing",
                IdempotencyKey = idempotencyKey,
            }, ct);

            // Step 6: PrintDocument setup & Spooler submission
            using var printDoc = new PrintDocument();
            printDoc.DocumentName = documentName;
            PrinterManager.ApplyPrintSettings(printDoc, job.Options, _config.PrinterName);

            int currentSheetIndex = 0;
            printDoc.PrintPage += (sender, e) =>
            {
                if (currentSheetIndex < compositeSheets.Count)
                {
                    var sheet = compositeSheets[currentSheetIndex];
                    if (e.Graphics != null)
                    {
                        e.Graphics.DrawImage(sheet, e.MarginBounds);
                    }
                    currentSheetIndex++;
                    e.HasMorePages = currentSheetIndex < compositeSheets.Count;
                }
                else
                {
                    e.HasMorePages = false;
                }
            };

            var stopwatch = Stopwatch.StartNew();
            printDoc.Print();

            _journalService.UpdateJobState(job.Id, "Monitoring");

            // Step 7: Monitor Spooler and renew lease every 60s
            int? spoolerJobId = null;
            DateTime lastLeaseRenewal = DateTime.UtcNow;

            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(2000, ct);

                // Renew lease periodically
                if ((DateTime.UtcNow - lastLeaseRenewal).TotalSeconds >= _config.LeaseRenewSeconds)
                {
                    Log.Information("[Pipeline] Renewing lease for Job {JobId} while printing", job.Id);
                    await _apiClient.RenewLeaseAsync(job.Id, idempotencyKey, ct);
                    lastLeaseRenewal = DateTime.UtcNow;
                }

                var spoolerInfo = PrinterManager.GetSpoolerJob(_config.PrinterName, documentName);
                if (spoolerInfo != null)
                {
                    spoolerJobId ??= spoolerInfo.SpoolerJobId;

                    if (spoolerInfo.IsInError || spoolerInfo.IsPaperOut || spoolerInfo.IsOffline)
                    {
                        string alertMsg = spoolerInfo.IsPaperOut ? "Paper tray empty" : "Printer reported error";
                        OnJobAlert?.Invoke("Printer Alert", alertMsg);
                    }

                    if (spoolerInfo.TotalPages > 0)
                    {
                        int percent = (int)((double)spoolerInfo.PagesPrinted / spoolerInfo.TotalPages * 100);
                        OnJobProgress?.Invoke(job.OrderNumber, percent);
                    }
                }
                else
                {
                    // Job disappeared from spooler: printing finished successfully
                    Log.Information("[Pipeline] Document {Doc} completed spooler processing", documentName);
                    break;
                }
            }

            stopwatch.Stop();
            int durationSeconds = Math.Max(1, (int)stopwatch.Elapsed.TotalSeconds);

            // Step 8: PATCH completed
            await _apiClient.UpdateJobStatusAsync(job.Id, new StatusUpdateRequest
            {
                Status = "completed",
                SpoolerJobId = spoolerJobId,
                SheetCount = sheetCount,
                PrintDurationSeconds = durationSeconds,
                IdempotencyKey = idempotencyKey,
            }, ct);

            _journalService.MarkJobDone(job.Id);
            Log.Information("[Pipeline] Job {JobId} (Order {OrderNumber}) completed successfully in {Duration}s ({Sheets} sheets)",
                job.Id, job.OrderNumber, durationSeconds, sheetCount);

            // Dispose bitmaps
            foreach (var sheet in compositeSheets) sheet.Dispose();
            foreach (var page in renderedPages) page.Dispose();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "[Pipeline] Job {JobId} failed: {Message}", job.Id, ex.Message);
            _journalService.MarkJobFailed(job.Id);

            await _apiClient.UpdateJobStatusAsync(job.Id, new StatusUpdateRequest
            {
                Status = "failed",
                ErrorMessage = ex.Message,
                IdempotencyKey = idempotencyKey,
            }, ct);

            OnJobAlert?.Invoke("Job Failed", $"Order {job.OrderNumber}: {ex.Message}");
        }
        finally
        {
            // Cleanup temp directory
            try
            {
                if (Directory.Exists(tempDir))
                {
                    Directory.Delete(tempDir, recursive: true);
                }
            }
            catch (Exception ex)
            {
                Log.Warning("[Pipeline] Temp directory cleanup warning: {Message}", ex.Message);
            }
        }
    }

    private static List<Bitmap> ComposeSheets(List<Bitmap> pages, int pagesPerSheet)
    {
        if (pagesPerSheet <= 1)
        {
            return pages;
        }

        var sheets = new List<Bitmap>();
        int index = 0;

        while (index < pages.Count)
        {
            if (pagesPerSheet == 2)
            {
                var p1 = pages[index++];
                var p2 = index < pages.Count ? pages[index++] : null;

                int sheetW = Math.Max(p1.Width, p2?.Width ?? p1.Width);
                int sheetH = p1.Height + (p2?.Height ?? 0);
                var sheet = new Bitmap(sheetW, sheetH);

                using (var g = Graphics.FromImage(sheet))
                {
                    g.Clear(Color.White);
                    g.DrawImage(p1, 0, 0);
                    if (p2 != null)
                    {
                        g.DrawImage(p2, 0, p1.Height);
                    }
                }
                sheets.Add(sheet);
            }
            else if (pagesPerSheet == 4)
            {
                var p1 = pages[index++];
                var p2 = index < pages.Count ? pages[index++] : null;
                var p3 = index < pages.Count ? pages[index++] : null;
                var p4 = index < pages.Count ? pages[index++] : null;

                int halfW = p1.Width;
                int halfH = p1.Height;
                var sheet = new Bitmap(halfW * 2, halfH * 2);

                using (var g = Graphics.FromImage(sheet))
                {
                    g.Clear(Color.White);
                    g.DrawImage(p1, 0, 0);
                    if (p2 != null) g.DrawImage(p2, halfW, 0);
                    if (p3 != null) g.DrawImage(p3, 0, halfH);
                    if (p4 != null) g.DrawImage(p4, halfW, halfH);
                }
                sheets.Add(sheet);
            }
        }

        return sheets;
    }
}
