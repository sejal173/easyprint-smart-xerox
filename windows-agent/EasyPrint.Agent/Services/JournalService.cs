using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using EasyPrint.Agent.Config;

namespace EasyPrint.Agent.Services;

public class JournalEntry
{
    public string JobId { get; set; } = "";
    public string OrderNumber { get; set; } = "";
    public string DocumentName { get; set; } = "";
    public string State { get; set; } = "Claimed";
    public int? SpoolerJobId { get; set; }
    public string IdempotencyKey { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class JournalService
{
    private readonly string _journalFilePath;
    private readonly object _lock = new();

    public JournalService(string? customPath = null)
    {
        _journalFilePath = customPath ?? Path.Combine(SecurityUtil.GetAppDataFolder(), "journal.json");
    }

    public List<JournalEntry> LoadEntries()
    {
        lock (_lock)
        {
            if (!File.Exists(_journalFilePath))
            {
                return new List<JournalEntry>();
            }

            try
            {
                string json = File.ReadAllText(_journalFilePath);
                var entries = JsonSerializer.Deserialize<List<JournalEntry>>(json);
                return entries ?? new List<JournalEntry>();
            }
            catch
            {
                return new List<JournalEntry>();
            }
        }
    }

    private void SaveEntries(List<JournalEntry> entries)
    {
        lock (_lock)
        {
            string dir = Path.GetDirectoryName(_journalFilePath) ?? "";
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            string tempFile = _journalFilePath + ".tmp";
            var options = new JsonSerializerOptions { WriteIndented = true };
            string json = JsonSerializer.Serialize(entries, options);

            File.WriteAllText(tempFile, json);
            File.Move(tempFile, _journalFilePath, overwrite: true);
        }
    }

    public void RecordJobClaimed(string jobId, string orderNumber, string documentName, string idempotencyKey)
    {
        lock (_lock)
        {
            var entries = LoadEntries();
            var existing = entries.FirstOrDefault(e => e.JobId == jobId);
            if (existing != null)
            {
                existing.OrderNumber = orderNumber;
                existing.DocumentName = documentName;
                existing.State = "Claimed";
                existing.IdempotencyKey = idempotencyKey;
                existing.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                entries.Add(new JournalEntry
                {
                    JobId = jobId,
                    OrderNumber = orderNumber,
                    DocumentName = documentName,
                    State = "Claimed",
                    IdempotencyKey = idempotencyKey,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }
            SaveEntries(entries);
        }
    }

    public void UpdateJobState(string jobId, string state, int? spoolerJobId = null)
    {
        lock (_lock)
        {
            var entries = LoadEntries();
            var entry = entries.FirstOrDefault(e => e.JobId == jobId);
            if (entry != null)
            {
                entry.State = state;
                if (spoolerJobId.HasValue)
                {
                    entry.SpoolerJobId = spoolerJobId.Value;
                }
                entry.UpdatedAt = DateTime.UtcNow;
                SaveEntries(entries);
            }
        }
    }

    public void MarkJobDone(string jobId)
    {
        UpdateJobState(jobId, "Completed");
    }

    public void MarkJobFailed(string jobId)
    {
        UpdateJobState(jobId, "Failed");
    }

    public List<JournalEntry> GetActiveEntries()
    {
        return LoadEntries()
            .Where(e => !e.State.Equals("Completed", StringComparison.OrdinalIgnoreCase) &&
                        !e.State.Equals("Failed", StringComparison.OrdinalIgnoreCase))
            .ToList();
    }
}

