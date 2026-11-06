using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using EasyPrint.Agent.Config;
using Serilog;
using SocketIOClient;

namespace EasyPrint.Agent.Services;

public class SocketListener : IAsyncDisposable
{
    private readonly AgentConfig _config;
    private readonly JobPipeline _pipeline;
    private SocketIOClient.SocketIO? _client;
    private bool _isDisposed;

    public event Action? OnConnected;
    public event Action? OnDisconnected;

    public bool IsConnected => _client?.Connected ?? false;

    public SocketListener(AgentConfig config, JobPipeline pipeline)
    {
        _config = config;
        _pipeline = pipeline;
    }

    public async Task StartAsync(CancellationToken ct = default)
    {
        string? token = SecurityUtil.LoadToken();
        if (string.IsNullOrEmpty(token))
        {
            Log.Warning("[Socket] No token stored; skipping socket connection.");
            return;
        }

        try
        {
            var options = new SocketIOOptions
            {
                Reconnection = true,
                ReconnectionAttempts = int.MaxValue,
                ReconnectionDelay = 1000,
                ReconnectionDelayMax = 60000,
                RandomizationFactor = 0.5,
                Auth = new Dictionary<string, string>
                {
                    { "token", token }
                },
                Transport = SocketIOClient.Transport.TransportProtocol.WebSocket
            };

            _client = new SocketIOClient.SocketIO(_config.ApiBaseUrl, options);

            _client.OnConnected += (sender, e) =>
            {
                Log.Information("[Socket] Connected to EasyPrint server at {Url}", _config.ApiBaseUrl);
                OnConnected?.Invoke();
                // Immediately check for any waiting jobs upon connection
                _ = Task.Run(() => _pipeline.TryProcessNextJobAsync(CancellationToken.None));
            };

            _client.OnDisconnected += (sender, reason) =>
            {
                Log.Warning("[Socket] Disconnected from server: {Reason}", reason);
                OnDisconnected?.Invoke();
            };

            _client.OnError += (sender, error) =>
            {
                Log.Error("[Socket] Error: {Error}", error);
            };

            _client.OnReconnectAttempt += (sender, attempt) =>
            {
                Log.Debug("[Socket] Reconnecting (Attempt {Attempt})...", attempt);
            };

            _client.On("queue.updated", response =>
            {
                Log.Information("[Socket] Received 'queue.updated' notification");
                _ = Task.Run(() => _pipeline.TryProcessNextJobAsync(CancellationToken.None));
            });

            _client.On("job.queued", response =>
            {
                Log.Information("[Socket] Received 'job.queued' notification");
                _ = Task.Run(() => _pipeline.TryProcessNextJobAsync(CancellationToken.None));
            });

            await _client.ConnectAsync();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "[Socket] Connection startup exception: {Message}", ex.Message);
            OnDisconnected?.Invoke();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_isDisposed) return;
        _isDisposed = true;

        if (_client != null)
        {
            try
            {
                await _client.DisconnectAsync();
                _client.Dispose();
            }
            catch {}
        }
    }
}
