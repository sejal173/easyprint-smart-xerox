using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using EasyPrint.Agent.Config;
using EasyPrint.Agent.Models;
using EasyPrint.Agent.Services;
using Xunit;

namespace EasyPrint.Agent.Tests;

public class IntegrationTests
{
    private class FakeApiHandler : HttpMessageHandler
    {
        public string LastJobStatus { get; private set; } = "none";
        public int? LastSheetCount { get; private set; }
        public int? LastPrintDuration { get; private set; }
        public bool LeaseWasRenewed { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string path = request.RequestUri?.AbsolutePath ?? "";

            // 1. Claim next job
            if (request.Method == HttpMethod.Get && path.EndsWith("/api/agent/jobs/next"))
            {
                var jobResponse = new JobNextResponse
                {
                    Success = true,
                    Job = new JobDto
                    {
                        Id = "job_int_test_99",
                        OrderNumber = "EP-261106-INT01",
                        Status = "claimed",
                        LeaseExpiresAt = DateTime.UtcNow.AddMinutes(5),
                        AttemptCount = 1,
                        Options = new OrderOptions
                        {
                            ColorMode = "bw",
                            Sides = "single",
                            PaperSize = "A4",
                            Copies = 1,
                            PagesPerSheet = 1
                        },
                        Files = new List<FileDto>
                        {
                            new()
                            {
                                Id = "file_1",
                                OriginalName = "test.pdf",
                                MimeType = "application/pdf",
                                PageCount = 3,
                                SizeBytes = 1024,
                                DownloadUrl = "http://localhost:5000/api/agent/storage-download?key=test.pdf"
                            }
                        }
                    }
                };

                string json = JsonSerializer.Serialize(jobResponse);
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
                };
            }

            // 2. Lease renewal
            if (request.Method == HttpMethod.Post && path.Contains("/lease"))
            {
                LeaseWasRenewed = true;
                string json = JsonSerializer.Serialize(new LeaseRenewResponse
                {
                    Success = true,
                    LeaseExpiresAt = DateTime.UtcNow.AddMinutes(5)
                });
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json")
                };
            }

            // 3. Status updates (printing / completed)
            if (string.Equals(request.Method.Method, "PATCH", StringComparison.OrdinalIgnoreCase) && path.Contains("/status"))
            {
                string body = request.Content != null ? await request.Content.ReadAsStringAsync(cancellationToken) : "";
                if (!string.IsNullOrEmpty(body))
                {
                    using var doc = JsonDocument.Parse(body);
                    foreach (var prop in doc.RootElement.EnumerateObject())
                    {
                        if (string.Equals(prop.Name, "status", StringComparison.OrdinalIgnoreCase))
                        {
                            LastJobStatus = prop.Value.GetString() ?? "";
                        }
                        else if (string.Equals(prop.Name, "sheetCount", StringComparison.OrdinalIgnoreCase))
                        {
                            LastSheetCount = prop.Value.GetInt32();
                        }
                        else if (string.Equals(prop.Name, "printDurationSeconds", StringComparison.OrdinalIgnoreCase))
                        {
                            LastPrintDuration = prop.Value.GetInt32();
                        }
                    }
                }

                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("{\"success\":true}", System.Text.Encoding.UTF8, "application/json")
                };
            }

            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }
    }

    [Fact]
    public async Task Pipeline_ClaimToCompletionLifecycle_UpdatesServerStatusCorrectly()
    {
        var fakeHandler = new FakeApiHandler();
        var httpClient = new HttpClient(fakeHandler)
        {
            BaseAddress = new Uri("http://localhost:5000/")
        };

        var config = new AgentConfig { ApiBaseUrl = "http://localhost:5000" };
        var apiClient = new HttpApiClient(config, httpClient);

        // 1. Claim next job
        var job = await apiClient.GetNextJobAsync();
        Assert.NotNull(job);
        Assert.Equal("job_int_test_99", job.Id);
        Assert.Equal("EP-261106-INT01", job.OrderNumber);

        // 2. Renew lease
        bool leaseOk = await apiClient.RenewLeaseAsync(job.Id, "key_renew_test");
        Assert.True(leaseOk);
        Assert.True(fakeHandler.LeaseWasRenewed);

        // 3. Transition to printing
        bool printingOk = await apiClient.UpdateJobStatusAsync(job.Id, new StatusUpdateRequest
        {
            Status = "printing",
            SpoolerJobId = 5510
        });
        Assert.True(printingOk);
        Assert.Equal("printing", fakeHandler.LastJobStatus);

        // 4. Transition to completed with sheet count & duration
        bool completedOk = await apiClient.UpdateJobStatusAsync(job.Id, new StatusUpdateRequest
        {
            Status = "completed",
            SheetCount = 3,
            PrintDurationSeconds = 12,
            IdempotencyKey = "key_complete_test"
        });
        Assert.True(completedOk);
        Assert.Equal("completed", fakeHandler.LastJobStatus);
        Assert.Equal(3, fakeHandler.LastSheetCount);
        Assert.Equal(12, fakeHandler.LastPrintDuration);
    }
}
