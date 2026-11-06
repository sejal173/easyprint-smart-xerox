using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace EasyPrint.Agent.Config;

public static class SecurityUtil
{
    private static readonly string AppDataFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "EasyPrint"
    );

    private static readonly string TokenFilePath = Path.Combine(AppDataFolder, "agent.dat");

    public static string GetAppDataFolder()
    {
        if (!Directory.Exists(AppDataFolder))
        {
            Directory.CreateDirectory(AppDataFolder);
        }
        return AppDataFolder;
    }

    public static void SaveToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new ArgumentException("Token cannot be empty", nameof(token));
        }

        GetAppDataFolder();
        byte[] plaintextBytes = Encoding.UTF8.GetBytes(token.Trim());
        byte[] encryptedBytes = ProtectedData.Protect(
            plaintextBytes,
            null,
            DataProtectionScope.CurrentUser
        );

        File.WriteAllBytes(TokenFilePath, encryptedBytes);
    }

    public static string? LoadToken()
    {
        try
        {
            if (!File.Exists(TokenFilePath))
            {
                return null;
            }

            byte[] encryptedBytes = File.ReadAllBytes(TokenFilePath);
            if (encryptedBytes.Length == 0)
            {
                return null;
            }

            byte[] decryptedBytes = ProtectedData.Unprotect(
                encryptedBytes,
                null,
                DataProtectionScope.CurrentUser
            );

            return Encoding.UTF8.GetString(decryptedBytes).Trim();
        }
        catch
        {
            return null;
        }
    }

    public static bool HasToken()
    {
        return !string.IsNullOrEmpty(LoadToken());
    }

    public static void ClearToken()
    {
        try
        {
            if (File.Exists(TokenFilePath))
            {
                File.Delete(TokenFilePath);
            }
        }
        catch
        {
            // Ignore deletion errors
        }
    }
}

