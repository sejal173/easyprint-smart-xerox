using EasyPrint.Agent.Services;
using Xunit;

namespace EasyPrint.Agent.Tests;

public class RecoveryTests
{
    [Theory]
    [InlineData("completed", true, RecoveryAction.MarkDoneLocally)]
    [InlineData("completed", false, RecoveryAction.MarkDoneLocally)]
    [InlineData("failed", false, RecoveryAction.MarkDoneLocally)]
    [InlineData("cancelled", false, RecoveryAction.MarkDoneLocally)]
    [InlineData("refunded", false, RecoveryAction.MarkDoneLocally)]
    public void DecideRecoveryAction_TerminalStates_MarksDoneLocallyAndNeverReprints(
        string serverStatus,
        bool isPresentInSpooler,
        RecoveryAction expectedAction)
    {
        var action = RecoveryService.DecideRecoveryAction(serverStatus, isPresentInSpooler);
        Assert.Equal(expectedAction, action);
    }

    [Theory]
    [InlineData("printing", true, RecoveryAction.ResumeMonitoring)]
    [InlineData("claimed", true, RecoveryAction.ResumeMonitoring)]
    public void DecideRecoveryAction_ActiveAndPresentInSpooler_ResumesMonitoring(
        string serverStatus,
        bool isPresentInSpooler,
        RecoveryAction expectedAction)
    {
        var action = RecoveryService.DecideRecoveryAction(serverStatus, isPresentInSpooler);
        Assert.Equal(expectedAction, action);
    }

    [Theory]
    [InlineData("printing", false, RecoveryAction.ReportFailed)]
    [InlineData("claimed", false, RecoveryAction.ReportFailed)]
    public void DecideRecoveryAction_ActiveAndMissingFromSpooler_ReportsFailed(
        string serverStatus,
        bool isPresentInSpooler,
        RecoveryAction expectedAction)
    {
        var action = RecoveryService.DecideRecoveryAction(serverStatus, isPresentInSpooler);
        Assert.Equal(expectedAction, action);
    }
}

