using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace EasyPrint.Agent.Models;

public class OrderOptions
{
    [JsonPropertyName("pageSelection")]
    public string PageSelection { get; set; } = "all";

    [JsonPropertyName("customRange")]
    public string CustomRange { get; set; } = "";

    [JsonPropertyName("colorMode")]
    public string ColorMode { get; set; } = "bw";

    [JsonPropertyName("sides")]
    public string Sides { get; set; } = "single";

    [JsonPropertyName("paperSize")]
    public string PaperSize { get; set; } = "A4";

    [JsonPropertyName("paperQuality")]
    public string PaperQuality { get; set; } = "normal";

    [JsonPropertyName("orientation")]
    public string Orientation { get; set; } = "portrait";

    [JsonPropertyName("copies")]
    public int Copies { get; set; } = 1;

    [JsonPropertyName("oddEven")]
    public string OddEven { get; set; } = "all";

    [JsonPropertyName("pagesPerSheet")]
    public int PagesPerSheet { get; set; } = 1;
}

public class FileDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("originalName")]
    public string OriginalName { get; set; } = "";

    [JsonPropertyName("mimeType")]
    public string MimeType { get; set; } = "";

    [JsonPropertyName("pageCount")]
    public int PageCount { get; set; } = 1;

    [JsonPropertyName("sizeBytes")]
    public long SizeBytes { get; set; } = 0;

    [JsonPropertyName("downloadUrl")]
    public string DownloadUrl { get; set; } = "";
}

public class BreakdownDto
{
    [JsonPropertyName("effectivePages")]
    public int EffectivePages { get; set; } = 1;

    [JsonPropertyName("sheetsPerCopy")]
    public int SheetsPerCopy { get; set; } = 1;

    [JsonPropertyName("totalPages")]
    public int TotalPages { get; set; } = 1;
}

public class JobDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("orderNumber")]
    public string OrderNumber { get; set; } = "";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("leaseExpiresAt")]
    public DateTime? LeaseExpiresAt { get; set; }

    [JsonPropertyName("attemptCount")]
    public int AttemptCount { get; set; } = 0;

    [JsonPropertyName("options")]
    public OrderOptions Options { get; set; } = new();

    [JsonPropertyName("breakdown")]
    public BreakdownDto? Breakdown { get; set; }

    [JsonPropertyName("totalAmount")]
    public decimal TotalAmount { get; set; } = 0;

    [JsonPropertyName("files")]
    public List<FileDto> Files { get; set; } = new();
}

public class JobNextResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("job")]
    public JobDto? Job { get; set; }
}

public class HeartbeatRequest
{
    [JsonPropertyName("printerStatus")]
    public string PrinterStatus { get; set; } = "ready";

    [JsonPropertyName("printerError")]
    public string? PrinterError { get; set; }

    [JsonPropertyName("agentVersion")]
    public string AgentVersion { get; set; } = "1.0.0";
}

public class StatusUpdateRequest
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("spoolerJobId")]
    public int? SpoolerJobId { get; set; }

    [JsonPropertyName("errorMessage")]
    public string? ErrorMessage { get; set; }

    [JsonPropertyName("idempotencyKey")]
    public string? IdempotencyKey { get; set; }

    [JsonPropertyName("sheetCount")]
    public int? SheetCount { get; set; }

    [JsonPropertyName("printDurationSeconds")]
    public int? PrintDurationSeconds { get; set; }
}

public class LeaseRenewRequest
{
    [JsonPropertyName("idempotencyKey")]
    public string? IdempotencyKey { get; set; }
}

public class LeaseRenewResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("leaseExpiresAt")]
    public DateTime? LeaseExpiresAt { get; set; }
}

public class ServerJobStatusResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("jobId")]
    public string JobId { get; set; } = "";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("attemptCount")]
    public int AttemptCount { get; set; }

    [JsonPropertyName("spoolerJobId")]
    public int? SpoolerJobId { get; set; }

    [JsonPropertyName("leaseExpiresAt")]
    public DateTime? LeaseExpiresAt { get; set; }

    [JsonPropertyName("orderNumber")]
    public string? OrderNumber { get; set; }
}

public class SpoolerJobProgress
{
    public int SpoolerJobId { get; set; }
    public string DocumentName { get; set; } = "";
    public int PagesPrinted { get; set; }
    public int TotalPages { get; set; }
    public bool IsInError { get; set; }
    public bool IsPaperOut { get; set; }
    public bool IsOffline { get; set; }
    public bool IsBlocked { get; set; }
    public bool IsSpooling { get; set; }
    public bool IsPrinting { get; set; }
    public bool IsCompleted { get; set; }
}

