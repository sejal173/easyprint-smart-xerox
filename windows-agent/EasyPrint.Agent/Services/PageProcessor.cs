using System;
using System.Collections.Generic;
using System.Linq;

namespace EasyPrint.Agent.Services;

public static class PageProcessor
{
    /// <summary>
    /// Parses a human-entered page range string (e.g., "1-3, 5, 8-10") into a distinct,
    /// sorted list of 1-based page indices clamped between 1 and totalPages.
    /// Exactly mirrors shared/src/pricing.js parsePageRange.
    /// </summary>
    public static List<int> ParsePageRange(string? customRange, int totalPages)
    {
        if (totalPages <= 0)
        {
            return new List<int>();
        }

        if (string.IsNullOrWhiteSpace(customRange))
        {
            return Enumerable.Range(1, totalPages).ToList();
        }

        var selectedPages = new HashSet<int>();
        string[] tokens = customRange.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (string token in tokens)
        {
            if (token.Contains('-'))
            {
                string[] parts = token.Split('-', StringSplitOptions.TrimEntries);
                if (parts.Length == 2 &&
                    int.TryParse(parts[0], out int start) &&
                    int.TryParse(parts[1], out int end))
                {
                    if (start > end)
                    {
                        (start, end) = (end, start);
                    }

                    int boundedStart = Math.Max(1, Math.Min(start, totalPages));
                    int boundedEnd = Math.Max(1, Math.Min(end, totalPages));

                    for (int p = boundedStart; p <= boundedEnd; p++)
                    {
                        selectedPages.Add(p);
                    }
                }
            }
            else if (int.TryParse(token, out int single))
            {
                if (single >= 1 && single <= totalPages)
                {
                    selectedPages.Add(single);
                }
            }
        }

        if (selectedPages.Count == 0)
        {
            return Enumerable.Range(1, totalPages).ToList();
        }

        return selectedPages.OrderBy(p => p).ToList();
    }

    /// <summary>
    /// Filters pages based on odd, even, or all.
    /// Exactly mirrors shared/src/pricing.js filterOddEven.
    /// </summary>
    public static List<int> FilterOddEven(IEnumerable<int> pages, string? oddEven)
    {
        var list = pages.ToList();
        if (string.IsNullOrWhiteSpace(oddEven) || oddEven.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            return list;
        }

        if (oddEven.Equals("odd", StringComparison.OrdinalIgnoreCase))
        {
            return list.Where(p => p % 2 != 0).ToList();
        }

        if (oddEven.Equals("even", StringComparison.OrdinalIgnoreCase))
        {
            return list.Where(p => p % 2 == 0).ToList();
        }

        return list;
    }

    /// <summary>
    /// Calculates the total sheets of paper consumed.
    /// Exactly mirrors shared/src/pricing.js and server sheet calculation.
    /// </summary>
    public static int CalculateSheetCount(int effectivePages, int pagesPerSheet, bool isDuplex, int copies)
    {
        if (effectivePages <= 0 || copies <= 0)
        {
            return 0;
        }

        int validNUp = pagesPerSheet switch
        {
            1 or 2 or 4 => pagesPerSheet,
            _ => 1
        };

        double sidesNeeded = Math.Ceiling((double)effectivePages / validNUp);
        double sheetsPerCopy = isDuplex ? Math.Ceiling(sidesNeeded / 2.0) : sidesNeeded;
        return (int)(sheetsPerCopy * copies);
    }
}

