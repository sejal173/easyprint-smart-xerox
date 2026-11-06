using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using EasyPrint.Agent.Config;
using EasyPrint.Agent.Models;
using Serilog;

namespace EasyPrint.Agent.Services;

public class HttpApiClient
{
    private readonly HttpClient _httpClient;
    private readonly AgentConfig _config;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    public HttpApiClient(AgentConfig config, HttpClient? customClient = null)
    {
        _config = config;
        _httpClient = customClient ?? new HttpClient
        {
            BaseAddress = new Uri(_config.ApiBaseUrl.TrimEnd('/') + "/"),
            Timeout = TimeSpan.FromSeconds(30),
        };
    }

    private void SetAuthorizationHeader()
    {
        string? token = SecurityUtil.LoadToken();
        if (!string.IsNullOrEmpty(token))
        {
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
    }

    public async Task<bool> SendHeartbeatAsync(HeartbeatRequest request, CancellationToken ct = default)
    {
        try
        {
            SetAuthorizationHeader();
            string json = JsonSerializer.Serialize(request, JsonOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync("api/agent/heartbeat", content, ct);
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "[API] Heartbeat delivery failed: {Message}", ex.Message);
            return false;
        }
    }

    public async Task<JobDto?> GetNextJobAsync(CancellationToken ct = default)
    {
        try
        {
            SetAuthorizationHeader();
            var response = await _httpClient.GetAsync("api/agent/jobs/next", ct);

            if (response.StatusCode == HttpStatusCode.NoContent)
            {
                return null;
            }

            if (!response.IsSuccessStatusCode)
            {
                Log.Warning("[API] GetNextJob returned non-success status: {StatusCode}", response.StatusCode);
                return null;
            }

            string json = await response.Content.ReadAsStringAsync(ct);
            var nextResp = JsonSerializer.Deserialize<JobNextResponse>(json, JsonOptions);
            return nextResp?.Job;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "[API] GetNextJob failed: {Message}", ex.Message);
            return null;
        }
    }

    public async Task<bool> RenewLeaseAsync(string jobId, string? idempotencyKey = null, CancellationToken ct = default)
    {
        try
        {
            SetAuthorizationHeader();
            var req = new LeaseRenewRequest { IdempotencyKey = idempotencyKey };
            string json = JsonSerializer.Serialize(req, JsonOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PostAsync($"api/agent/jobs/{jobId}/lease", content, ct);
            if (response.StatusCode == HttpStatusCode.Conflict)
            {
                Log.Warning("[API] Job {JobId} lease renewal returned 409 Conflict: job no longer owned by this device", jobId);
                return false;
            }
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "[API] RenewLease for job {JobId} failed: {Message}", jobId, ex.Message);
            return false;
        }
    }

    public async Task<bool> UpdateJobStatusAsync(string jobId, StatusUpdateRequest request, CancellationToken ct = default)
    {
        try
        {
            SetAuthorizationHeader();
            string json = JsonSerializer.Serialize(request, JsonOptions);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.PatchAsync($"api/agent/jobs/{jobId}/status", content, ct);
            if (!response.IsSuccessStatusCode)
            {
                string errorText = await response.Content.ReadAsStringAsync(ct);
                Log.Error("[API] UpdateJobStatus {JobId} to {Status} failed with {Code}: {Error}",
                    jobId, request.Status, response.StatusCode, errorText);
            }
            return response.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Log.Error(ex, "[API] UpdateJobStatus for job {JobId} exception: {Message}", jobId, ex.Message);
            return false;
        }
    }

    public async Task<ServerJobStatusResponse?> GetJobStatusAsync(string jobId, CancellationToken ct = default)
    {
        try
        {
            SetAuthorizationHeader();
            var response = await _httpClient.GetAsync($"api/agent/jobs/{jobId}/status", ct);

            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            string json = await response.Content.ReadAsStringAsync(ct);
            return JsonSerializer.Deserialize<ServerJobStatusResponse>(json, JsonOptions);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "[API] GetJobStatus for job {JobId} failed: {Message}", jobId, ex.Message);
            return null;
        }
    }

    public async Task<bool> DownloadFileAsync(string downloadUrl, string destinationPath, long expectedSizeBytes = 0, CancellationToken ct = default)
    {
        string dir = Path.GetDirectoryName(destinationPath) ?? "";
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }

        Uri requestUri = Uri.IsWellFormedUriString(downloadUrl, UriKind.Absolute)
            ? new Uri(downloadUrl)
            : new Uri(new Uri(_config.ApiBaseUrl.TrimEnd('/') + "/"), downloadUrl.TrimStart('/'));

        using var response = await _httpClient.GetAsync(requestUri, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode)
        {
            Log.Error("[API] Download failed with status {StatusCode} for URL: {Url}", response.StatusCode, downloadUrl);
            return false;
        }

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        await using var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);
        await stream.CopyToAsync(fileStream, ct);
        await fileStream.FlushAsync(ct);

        long writtenBytes = new FileInfo(destinationPath).Length;
        if (expectedSizeBytes > 0 && writtenBytes != expectedSizeBytes)
        {
            Log.Warning("[API] File size mismatch: expected {Expected} bytes, got {Actual} bytes", expectedSizeBytes, writtenBytes);
        }

        return true;
    }
}
