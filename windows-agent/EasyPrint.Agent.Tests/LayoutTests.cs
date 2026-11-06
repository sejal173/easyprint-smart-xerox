using EasyPrint.Agent.Services;
using Xunit;

namespace EasyPrint.Agent.Tests;

public class LayoutTests
{
    [Theory]
    // effectivePages, pagesPerSheet, isDuplex, copies, expectedSheets
    [InlineData(10, 1, false, 1, 10)] // 10 pages, 1-up, simplex -> 10 sheets
    [InlineData(10, 1, true, 1, 5)]   // 10 pages, 1-up, duplex -> 5 sheets
    [InlineData(10, 2, false, 1, 5)]  // 10 pages, 2-up, simplex -> 5 sheets
    [InlineData(10, 2, true, 1, 3)]   // 10 pages, 2-up, duplex -> ceil(5/2) = 3 sheets
    [InlineData(10, 4, false, 1, 3)]  // 10 pages, 4-up, simplex -> ceil(10/4) = 3 sheets
    [InlineData(10, 4, true, 1, 2)]   // 10 pages, 4-up, duplex -> ceil(3/2) = 2 sheets
    [InlineData(10, 1, false, 3, 30)] // 3 copies of 10 pages simplex -> 30 sheets
    [InlineData(7, 2, true, 2, 4)]    // 7 pages, 2-up -> 4 sides, duplex -> 2 sheets/copy * 2 copies = 4 sheets
    public void CalculateSheetCount_VariousOptions_MatchesExpected(
        int effectivePages,
        int pagesPerSheet,
        bool isDuplex,
        int copies,
        int expectedSheets)
    {
        int actual = PageProcessor.CalculateSheetCount(effectivePages, pagesPerSheet, isDuplex, copies);
        Assert.Equal(expectedSheets, actual);
    }
}

