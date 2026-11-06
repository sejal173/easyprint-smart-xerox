using System;
using System.IO;
using System.Windows.Forms;
using EasyPrint.Agent.Config;
using EasyPrint.Agent.Services;
using EasyPrint.Agent.UI;
using Serilog;

namespace EasyPrint.Agent;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();

        // 1. Initialize Serilog with 14-day rolling retention in %LOCALAPPDATA%\EasyPrint\logs
        string logFolder = Path.Combine(SecurityUtil.GetAppDataFolder(), "logs");
        Directory.CreateDirectory(logFolder);

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .WriteTo.File(
                Path.Combine(logFolder, "agent-.log"),
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 14,
                outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff} [{Level:u3}] {Message:lj}{NewLine}{Exception}"
            )
            .CreateLogger();

        Log.Information("====================================================");
        Log.Information(" EasyPrint Windows Background Printing Agent Starting");
        Log.Information("====================================================");

        try
        {
            // 2. Clean stale temp files (> 24 hours old)
            SweepStaleTempFiles();

            // 3. Load Configuration
            var config = ConfigManager.Load();

            // 4. Check for DPAPI token; if missing, show Pairing Form
            if (!SecurityUtil.HasToken())
            {
                Log.Information("[Setup] No device pairing token detected. Displaying pairing dialog.");
                var pairingForm = new PairingForm(config);
                Application.Run(pairingForm);

                if (!pairingForm.IsPairedSuccessfully || !SecurityUtil.HasToken())
                {
                    Log.Information("[Setup] Pairing was not completed. Exiting agent.");
                    return;
                }
            }

            // 5. Configure Autostart in HKCU Run
            ConfigManager.SetAutoStart(true);

            // 6. Initialize Core Services
            var apiClient = new HttpApiClient(config);
            var journalService = new JournalService();
            var pdfRenderer = new PdfRenderer();
            var pipeline = new JobPipeline(config, apiClient, journalService, pdfRenderer);
            var socketListener = new SocketListener(config, pipeline);

            // 7. Run Tray Application Context
            var trayContext = new TrayApplicationContext(
                config,
                apiClient,
                pipeline,
                socketListener,
                journalService
            );

            Application.Run(trayContext);
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "Fatal agent termination error: {Message}", ex.Message);
            MessageBox.Show(
                $"EasyPrint Agent encountered an unexpected error:\n\n{ex.Message}",
                "EasyPrint Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
        finally
        {
            Log.Information("EasyPrint Windows Printing Agent Shutting Down.");
            Log.CloseAndFlush();
        }
    }

    private static void SweepStaleTempFiles()
    {
        try
        {
            string tempBase = Path.Combine(SecurityUtil.GetAppDataFolder(), "temp");
            if (!Directory.Exists(tempBase)) return;

            var cutoff = DateTime.UtcNow.AddHours(-24);
            foreach (var dir in Directory.GetDirectories(tempBase))
            {
                var dirInfo = new DirectoryInfo(dir);
                if (dirInfo.CreationTimeUtc < cutoff)
                {
                    try
                    {
                        Directory.Delete(dir, recursive: true);
                        Log.Information("[Sweep] Removed stale temp folder: {Dir}", dir);
                    }
                    catch {}
                }
            }
        }
        catch (Exception ex)
        {
            Log.Warning("[Sweep] Temp sweep warning: {Message}", ex.Message);
        }
    }
}
