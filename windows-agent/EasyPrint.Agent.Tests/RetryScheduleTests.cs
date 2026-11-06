using System;
using Xunit;

namespace EasyPrint.Agent.Tests;

public class RetryScheduleTests
{
    public static TimeSpan CalculateBackoff(int attempt, int baseSeconds = 1, int maxSeconds = 60)
    {
        if (attempt <= 0) return TimeSpan.FromSeconds(baseSeconds);
        double delay = Math.Min(maxSeconds, baseSeconds * Math.Pow(2, attempt - 1));
        return TimeSpan.FromSeconds(delay);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 2)]
    [InlineData(3, 4)]
    [InlineData(4, 8)]
    [InlineData(5, 16)]
    [InlineData(6, 32)]
    [InlineData(7, 60)] // Capped at max 60 seconds
    public void CalculateBackoff_ExponentialGrowth_CapsAtMaxDelay(int attempt, int expectedSeconds)
    {
        var delay = CalculateBackoff(attempt, baseSeconds: 1, maxSeconds: 60);
        Assert.Equal(TimeSpan.FromSeconds(expectedSeconds), delay);
    }
}

