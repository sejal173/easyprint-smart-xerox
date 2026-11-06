using System;

namespace EasyPrint.Agent.Services;

public enum RecoveryAction
{
    MarkDoneLocally,
    ResumeMonitoring,
    ReportFailed,
}

public static class RecoveryService
{
    /// <summary>
    /// Pure decision function for crash/restart recovery.
    /// Tested in unit tests.
    /// </summary>
    /// <param name="serverStatus">Status reported by GET /api/agent/jobs/:id/status</param>
    /// <param name="isPresentInSpooler">Whether the document is currently in the Windows print spooler</param>
    /// <returns>RecoveryAction indicating next step</returns>
    public static RecoveryAction DecideRecoveryAction(string? serverStatus, bool isPresentInSpooler)
    {
        if (string.IsNullOrWhiteSpace(serverStatus))
        {
            return isPresentInSpooler ? RecoveryAction.ResumeMonitoring : RecoveryAction.ReportFailed;
        }

        string normalized = serverStatus.Trim().ToLowerInvariant();

        // 1. If server says completed, mark done locally. Never reprint!
        if (normalized == "completed")
        {
            return RecoveryAction.MarkDoneLocally;
        }

        // 2. If server says failed, cancelled, or refunded, mark done locally.
        if (normalized is "failed" or "cancelled" or "refunded")
        {
            return RecoveryAction.MarkDoneLocally;
        }

        // 3. If server says claimed or printing:
        if (normalized is "claimed" or "printing")
        {
            // If spooler still has the job, resume monitoring it
            if (isPresentInSpooler)
            {
                return RecoveryAction.ResumeMonitoring;
            }

            // Spooler has no matching job: report failure
            return RecoveryAction.ReportFailed;
        }

        return RecoveryAction.ReportFailed;
    }
}

