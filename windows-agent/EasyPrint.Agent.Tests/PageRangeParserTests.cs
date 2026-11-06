using System.Collections.Generic;
using EasyPrint.Agent.Services;
using Xunit;

namespace EasyPrint.Agent.Tests;

public class PageRangeParserTests
{
    [Fact]
    public void ParsePageRange_StandardCommasAndRanges_ReturnsSortedUniquePages()
    {
        var result = PageProcessor.ParsePageRange("1-3, 5", 10);
        Assert.Equal(new List<int> { 1, 2, 3, 5 }, result);
    }

    [Fact]
    public void ParsePageRange_SwappedRangeBounds_HandlesReversedOrder()
    {
        var result = PageProcessor.ParsePageRange("5-2", 10);
        Assert.Equal(new List<int> { 2, 3, 4, 5 }, result);
    }

    [Fact]
    public void ParsePageRange_OutOfBounds_ClampsToMaxPages()
    {
        var result = PageProcessor.ParsePageRange("8-15, 20", 10);
        Assert.Equal(new List<int> { 8, 9, 10 }, result);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void ParsePageRange_EmptyOrNull_ReturnsAllPages(string? range)
    {
        var result = PageProcessor.ParsePageRange(range, 5);
        Assert.Equal(new List<int> { 1, 2, 3, 4, 5 }, result);
    }

    [Fact]
    public void FilterOddEven_OddFilter_ReturnsOnlyOdds()
    {
        var pages = new List<int> { 1, 2, 3, 4, 5, 6, 7 };
        var result = PageProcessor.FilterOddEven(pages, "odd");
        Assert.Equal(new List<int> { 1, 3, 5, 7 }, result);
    }

    [Fact]
    public void FilterOddEven_EvenFilter_ReturnsOnlyEvens()
    {
        var pages = new List<int> { 1, 2, 3, 4, 5, 6, 7 };
        var result = PageProcessor.FilterOddEven(pages, "even");
        Assert.Equal(new List<int> { 2, 4, 6 }, result);
    }

    [Fact]
    public void FilterOddEven_AllFilter_ReturnsAllPages()
    {
        var pages = new List<int> { 1, 2, 3, 4, 5 };
        var result = PageProcessor.FilterOddEven(pages, "all");
        Assert.Equal(pages, result);
    }
}

