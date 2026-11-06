using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using PDFiumCore;
using Serilog;

namespace EasyPrint.Agent.Services;

public class PdfRenderer : IDisposable
{
    private static bool _isLibraryInitialized = false;
    private static readonly object _initLock = new();

    public PdfRenderer()
    {
        EnsureLibraryInitialized();
    }

    public static void EnsureLibraryInitialized()
    {
        lock (_initLock)
        {
            if (!_isLibraryInitialized)
            {
                try
                {
                    fpdfview.FPDF_InitLibrary();
                    _isLibraryInitialized = true;
                }
                catch (Exception ex)
                {
                    Log.Error(ex, "[PDFium] Failed to initialize PDFium library: {Message}", ex.Message);
                }
            }
        }
    }

    public static bool ValidateMagicBytes(string filePath, out string detectedMimeType)
    {
        detectedMimeType = "application/octet-stream";
        if (!File.Exists(filePath))
        {
            return false;
        }

        byte[] header = new byte[8];
        using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            int read = fs.Read(header, 0, header.Length);
            if (read < 4)
            {
                return false;
            }
        }

        // PDF: %PDF- (0x25, 0x50, 0x44, 0x46)
        if (header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46)
        {
            detectedMimeType = "application/pdf";
            return true;
        }

        // PNG: 0x89, 0x50, 0x4E, 0x47
        if (header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47)
        {
            detectedMimeType = "image/png";
            return true;
        }

        // JPEG: 0xFF, 0xD8, 0xFF
        if (header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF)
        {
            detectedMimeType = "image/jpeg";
            return true;
        }

        return false;
    }

    public int GetPdfPageCount(string filePath)
    {
        EnsureLibraryInitialized();
        var doc = fpdfview.FPDF_LoadDocument(filePath, null);
        if (doc == null || doc.__Instance == IntPtr.Zero)
        {
            throw new InvalidOperationException($"Unable to open PDF document: {filePath}");
        }

        try
        {
            return fpdfview.FPDF_GetPageCount(doc);
        }
        finally
        {
            fpdfview.FPDF_CloseDocument(doc);
        }
    }

    public Bitmap RenderPage(string filePath, int pageIndex1Based, int targetDpi = 300)
    {
        EnsureLibraryInitialized();
        var doc = fpdfview.FPDF_LoadDocument(filePath, null);
        if (doc == null || doc.__Instance == IntPtr.Zero)
        {
            throw new InvalidOperationException($"Unable to open PDF document: {filePath}");
        }

        try
        {
            int zeroIndex = Math.Max(0, pageIndex1Based - 1);
            var page = fpdfview.FPDF_LoadPage(doc, zeroIndex);
            if (page == null || page.__Instance == IntPtr.Zero)
            {
                throw new InvalidOperationException($"Unable to load PDF page {pageIndex1Based}");
            }

            try
            {
                double ptWidth = fpdfview.FPDF_GetPageWidth(page);
                double ptHeight = fpdfview.FPDF_GetPageHeight(page);

                // 1 pt = 1/72 inch. Pixels at targetDpi:
                int pixelWidth = (int)Math.Round((ptWidth / 72.0) * targetDpi);
                int pixelHeight = (int)Math.Round((ptHeight / 72.0) * targetDpi);

                var bitmap = new Bitmap(pixelWidth, pixelHeight, PixelFormat.Format32bppArgb);
                bitmap.SetResolution(targetDpi, targetDpi);

                var rect = new Rectangle(0, 0, pixelWidth, pixelHeight);
                var bmpData = bitmap.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);

                try
                {
                    var fpdfBitmap = fpdfview.FPDFBitmapCreateEx(
                        pixelWidth,
                        pixelHeight,
                        4, // FPDFBitmap_BGRA
                        bmpData.Scan0,
                        bmpData.Stride
                    );

                    // Fill white background
                    fpdfview.FPDFBitmapFillRect(fpdfBitmap, 0, 0, pixelWidth, pixelHeight, 0xFFFFFFFF);

                    // Render page
                    fpdfview.FPDF_RenderPageBitmap(
                        fpdfBitmap,
                        page,
                        0, 0,
                        pixelWidth, pixelHeight,
                        0, // 0 orientation
                        (int)RenderFlags.RenderAnnotations
                    );

                    fpdfview.FPDFBitmapDestroy(fpdfBitmap);
                }
                finally
                {
                    bitmap.UnlockBits(bmpData);
                }

                return bitmap;
            }
            finally
            {
                fpdfview.FPDF_ClosePage(page);
            }
        }
        finally
        {
            fpdfview.FPDF_CloseDocument(doc);
        }
    }

    public Bitmap RenderImage(string filePath, int targetDpi = 300)
    {
        using var original = Image.FromFile(filePath);
        var bitmap = new Bitmap(original);
        bitmap.SetResolution(targetDpi, targetDpi);
        return bitmap;
    }

    public void Dispose()
    {
        // Library is initialized statically for application lifetime
    }
}
