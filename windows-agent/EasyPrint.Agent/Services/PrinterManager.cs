using System;
using System.Drawing.Printing;
using System.Linq;
using System.Printing;
using EasyPrint.Agent.Models;
using Serilog;

namespace EasyPrint.Agent.Services;

public class PrinterManager
{
    public static string GetEffectivePrinterName(string? configuredName)
    {
        if (!string.IsNullOrWhiteSpace(configuredName))
        {
            return configuredName.Trim();
        }

        var settings = new PrinterSettings();
        return settings.PrinterName;
    }

    /// <summary>
    /// Checks the hardware and spooler status of the designated printer.
    /// </summary>
    public static (string status, string? error) GetPrinterStatus(string? printerName)
    {
        string targetPrinter = GetEffectivePrinterName(printerName);
        try
        {
            using var printServer = new LocalPrintServer();
            PrintQueue queue;
            try
            {
                queue = printServer.GetPrintQueue(targetPrinter);
            }
            catch
            {
                queue = printServer.DefaultPrintQueue;
            }

            if (queue == null)
            {
                return ("error", $"Printer '{targetPrinter}' not found.");
            }

            queue.Refresh();

            if (queue.IsOffline)
            {
                return ("offline", "Printer is offline.");
            }

            if (queue.IsOutOfPaper || queue.QueueStatus.HasFlag(PrintQueueStatus.PaperOut))
            {
                return ("error", "Printer paper tray is empty (Paper Out).");
            }

            if (queue.IsInError)
            {
                return ("error", "Printer is in an error state.");
            }

            if (queue.IsDoorOpened)
            {
                return ("error", "Printer cover/door is open.");
            }

            if (queue.IsPaperJammed)
            {
                return ("error", "Printer paper jam detected.");
            }

            return ("ready", null);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "[PrinterManager] Failed to read queue status for '{Printer}': {Message}", targetPrinter, ex.Message);
            return ("ready", null); // Fallback to ready if spooler query fails
        }
    }

    /// <summary>
    /// Configures PrintDocument settings according to OrderOptions.
    /// Validates duplex capabilities and paper sizes strictly.
    /// </summary>
    public static void ApplyPrintSettings(PrintDocument doc, OrderOptions options, string? configuredPrinter)
    {
        string targetPrinter = GetEffectivePrinterName(configuredPrinter);
        doc.PrinterSettings.PrinterName = targetPrinter;

        if (!doc.PrinterSettings.IsValid)
        {
            throw new InvalidOperationException($"Printer '{targetPrinter}' is not valid or not installed.");
        }

        // 1. Color Mode
        bool isColor = options.ColorMode.Equals("color", StringComparison.OrdinalIgnoreCase);
        doc.DefaultPageSettings.Color = isColor;

        // 2. Duplex Mode
        bool isDuplex = options.Sides.Equals("double", StringComparison.OrdinalIgnoreCase);
        if (isDuplex)
        {
            if (!doc.PrinterSettings.CanDuplex)
            {
                throw new InvalidOperationException($"Printer '{targetPrinter}' cannot duplex. Double-sided printing is not supported.");
            }
            doc.PrinterSettings.Duplex = Duplex.Vertical;
        }
        else
        {
            doc.PrinterSettings.Duplex = Duplex.Simplex;
        }

        // 3. Paper Size (A4 or A3)
        string requestedSize = options.PaperSize.Trim().ToUpperInvariant();
        PaperSize? matchedSize = null;

        foreach (PaperSize size in doc.PrinterSettings.PaperSizes)
        {
            if (requestedSize == "A3" && (size.Kind == PaperKind.A3 || size.PaperName.Contains("A3", StringComparison.OrdinalIgnoreCase)))
            {
                matchedSize = size;
                break;
            }
            if (requestedSize == "A4" && (size.Kind == PaperKind.A4 || size.PaperName.Contains("A4", StringComparison.OrdinalIgnoreCase)))
            {
                matchedSize = size;
                break;
            }
        }

        if (matchedSize == null)
        {
            throw new InvalidOperationException($"Paper size '{requestedSize}' is not supported by printer '{targetPrinter}'.");
        }
        doc.DefaultPageSettings.PaperSize = matchedSize;

        // 4. Orientation
        doc.DefaultPageSettings.Landscape = options.Orientation.Equals("landscape", StringComparison.OrdinalIgnoreCase);

        // 5. Copies and Collation
        doc.PrinterSettings.Copies = (short)Math.Max(1, options.Copies);
        doc.PrinterSettings.Collate = true;

        // 6. Paper Quality / Glossy
        if (options.PaperQuality.Equals("glossy", StringComparison.OrdinalIgnoreCase))
        {
            // Standard PrintDocument does not have a reliable vendor-agnostic glossy setting.
            // As per specification, fail with clear instructions for owner manual selection.
            throw new InvalidOperationException("Glossy paper must be loaded and selected manually in the printer tray.");
        }
    }

    /// <summary>
    /// Polls the print spooler to locate the print job by its unique document name.
    /// </summary>
    public static SpoolerJobProgress? GetSpoolerJob(string? configuredPrinter, string documentName)
    {
        string targetPrinter = GetEffectivePrinterName(configuredPrinter);
        try
        {
            using var printServer = new LocalPrintServer();
            PrintQueue queue;
            try
            {
                queue = printServer.GetPrintQueue(targetPrinter);
            }
            catch
            {
                queue = printServer.DefaultPrintQueue;
            }

            if (queue == null) return null;

            queue.Refresh();
            var printJobs = queue.GetPrintJobInfoCollection();

            foreach (PrintSystemJobInfo job in printJobs)
            {
                if (job.Name.Contains(documentName, StringComparison.OrdinalIgnoreCase))
                {
                    return new SpoolerJobProgress
                    {
                        SpoolerJobId = job.JobIdentifier,
                        DocumentName = job.Name,
                        PagesPrinted = job.NumberOfPagesPrinted,
                        TotalPages = job.NumberOfPages,
                        IsInError = job.JobStatus.HasFlag(PrintJobStatus.Error),
                        IsPaperOut = job.JobStatus.HasFlag(PrintJobStatus.PaperOut),
                        IsOffline = job.JobStatus.HasFlag(PrintJobStatus.Offline),
                        IsBlocked = job.JobStatus.HasFlag(PrintJobStatus.Blocked),
                        IsSpooling = job.JobStatus.HasFlag(PrintJobStatus.Spooling),
                        IsPrinting = job.JobStatus.HasFlag(PrintJobStatus.Printing),
                        IsCompleted = job.JobStatus.HasFlag(PrintJobStatus.Completed) || job.JobStatus.HasFlag(PrintJobStatus.Printed),
                    };
                }
            }

            return null;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "[PrinterManager] Spooler query failed for document '{Doc}': {Message}", documentName, ex.Message);
            return null;
        }
    }
}
