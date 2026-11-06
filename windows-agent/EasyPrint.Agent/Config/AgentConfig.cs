namespace EasyPrint.Agent.Config;

public class AgentConfig
{
    public string ApiBaseUrl { get; set; } = "http://localhost:5000";
    public string? PrinterName { get; set; } = null;
    public int PollIntervalSeconds { get; set; } = 15;
    public int HeartbeatIntervalSeconds { get; set; } = 30;
    public int LeaseRenewSeconds { get; set; } = 60;
    public int MaxAttempts { get; set; } = 3;
}

