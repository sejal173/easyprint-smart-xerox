using System;
using System.IO;
using EasyPrint.Agent.Services;
using Xunit;

namespace EasyPrint.Agent.Tests;

public class JournalTests : IDisposable
{
    private readonly string _testJournalPath;

    public JournalTests()
    {
        _testJournalPath = Path.Combine(Path.GetTempPath(), $"easyprint_journal_test_{Guid.NewGuid():N}.json");
    }

    [Fact]
    public void Journal_AtomicWriteAndReload_PersistsCorrectly()
    {
        var service = new JournalService(_testJournalPath);

        service.RecordJobClaimed("job_101", "EP-261106-0001", "EP-EP-261106-0001-job_101", "idem_key_1");
        service.UpdateJobState("job_101", "Printing", spoolerJobId: 450);

        // Create a new service instance reading the same file
        var reloadedService = new JournalService(_testJournalPath);
        var entries = reloadedService.LoadEntries();

        Assert.Single(entries);
        var entry = entries[0];
        Assert.Equal("job_101", entry.JobId);
        Assert.Equal("EP-261106-0001", entry.OrderNumber);
        Assert.Equal("Printing", entry.State);
        Assert.Equal(450, entry.SpoolerJobId);
        Assert.Equal("idem_key_1", entry.IdempotencyKey);
    }

    [Fact]
    public void Journal_StateTransitions_CompletedAndFailedExcludedFromActive()
    {
        var service = new JournalService(_testJournalPath);

        service.RecordJobClaimed("job_active", "EP-1", "doc1", "key1");
        service.RecordJobClaimed("job_done", "EP-2", "doc2", "key2");
        service.RecordJobClaimed("job_failed", "EP-3", "doc3", "key3");

        service.MarkJobDone("job_done");
        service.MarkJobFailed("job_failed");

        var activeEntries = service.GetActiveEntries();
        Assert.Single(activeEntries);
        Assert.Equal("job_active", activeEntries[0].JobId);
    }

    public void Dispose()
    {
        try
        {
            if (File.Exists(_testJournalPath))
            {
                File.Delete(_testJournalPath);
            }
        }
        catch {}
    }
}

