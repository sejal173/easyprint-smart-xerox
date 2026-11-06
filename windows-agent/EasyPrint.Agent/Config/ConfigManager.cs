using System;
using System.IO;
using System.Text.Json;
using Microsoft.Win32;

namespace EasyPrint.Agent.Config;

public class ConfigManager
{
    private static readonly string ConfigPath = Path.Combine(
        SecurityUtil.GetAppDataFolder(),
        "appsettings.json"
    );

    public static AgentConfig Load()
    {
        try
        {
            if (File.Exists(ConfigPath))
            {
                string json = File.ReadAllText(ConfigPath);
                var config = JsonSerializer.Deserialize<AgentConfig>(json);
                if (config != null)
                {
                    return config;
                }
            }

            // Fallback to next to exe if present
            string localExeConfig = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json");
            if (File.Exists(localExeConfig))
            {
                string json = File.ReadAllText(localExeConfig);
                var config = JsonSerializer.Deserialize<AgentConfig>(json);
                if (config != null)
                {
                    return config;
                }
            }
        }
        catch
        {
            // Fallback to default
        }

        var defaultConfig = new AgentConfig();
        Save(defaultConfig);
        return defaultConfig;
    }

    public static void Save(AgentConfig config)
    {
        try
        {
            SecurityUtil.GetAppDataFolder();
            var options = new JsonSerializerOptions { WriteIndented = true };
            string json = JsonSerializer.Serialize(config, options);
            File.WriteAllText(ConfigPath, json);
        }
        catch
        {
            // Ignore error
        }
    }

    public static bool ValidateApiUrl(string url, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(url))
        {
            error = "API Base URL cannot be empty.";
            return false;
        }

        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            error = "Invalid URL format.";
            return false;
        }

        bool isLoopback = uri.IsLoopback || uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase);

#if DEBUG
        if (uri.Scheme != Uri.UriSchemeHttps && !isLoopback)
        {
            error = "Only HTTPS is allowed for remote servers.";
            return false;
        }
#else
        if (uri.Scheme != Uri.UriSchemeHttps && !isLoopback)
        {
            error = "API Base URL must use HTTPS in production.";
            return false;
        }
#endif

        return true;
    }

    public static void SetAutoStart(bool enable)
    {
        try
        {
            const string runKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
            const string appName = "EasyPrintAgent";
            using var key = Registry.CurrentUser.OpenSubKey(runKey, true);
            if (key == null) return;

            if (enable)
            {
                string exePath = Environment.ProcessPath ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "EasyPrint.Agent.exe");
                key.SetValue(appName, $"\"{exePath}\"");
            }
            else
            {
                key.DeleteValue(appName, false);
            }
        }
        catch
        {
            // Ignore registry errors
        }
    }
}

