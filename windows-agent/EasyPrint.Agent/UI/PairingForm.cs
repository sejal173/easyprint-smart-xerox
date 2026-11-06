using System;
using System.Drawing;
using System.Windows.Forms;
using EasyPrint.Agent.Config;

namespace EasyPrint.Agent.UI;

public class PairingForm : Form
{
    private readonly TextBox _txtApiUrl;
    private readonly TextBox _txtToken;
    private readonly Button _btnPair;
    private readonly Button _btnCancel;
    private readonly Label _lblStatus;
    private readonly AgentConfig _config;

    public bool IsPairedSuccessfully { get; private set; }

    public PairingForm(AgentConfig config)
    {
        _config = config;

        Text = "EasyPrint - Pair Printing Agent";
        Size = new Size(500, 320);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        BackColor = Color.White;

        var lblHeader = new Label
        {
            Text = "EasyPrint Smart Xerox Agent Setup",
            Font = new Font("Segoe UI", 12, FontStyle.Bold),
            ForeColor = Color.FromArgb(15, 23, 42),
            Location = new Point(24, 20),
            AutoSize = true
        };

        var lblSub = new Label
        {
            Text = "Enter the server API URL and device token generated from your Owner Dashboard.",
            Font = new Font("Segoe UI", 9, FontStyle.Regular),
            ForeColor = Color.FromArgb(100, 116, 139),
            Location = new Point(24, 50),
            Size = new Size(440, 36)
        };

        var lblApi = new Label
        {
            Text = "API Base URL:",
            Font = new Font("Segoe UI", 9, FontStyle.Bold),
            Location = new Point(24, 94),
            AutoSize = true
        };

        _txtApiUrl = new TextBox
        {
            Text = _config.ApiBaseUrl,
            Font = new Font("Segoe UI", 9.5f),
            Location = new Point(24, 116),
            Size = new Size(436, 26)
        };

        var lblToken = new Label
        {
            Text = "One-Time Agent Token:",
            Font = new Font("Segoe UI", 9, FontStyle.Bold),
            Location = new Point(24, 154),
            AutoSize = true
        };

        _txtToken = new TextBox
        {
            Font = new Font("Consolas", 9.5f),
            Location = new Point(24, 176),
            Size = new Size(436, 26),
            UseSystemPasswordChar = true
        };

        _lblStatus = new Label
        {
            ForeColor = Color.Red,
            Font = new Font("Segoe UI", 8.5f),
            Location = new Point(24, 210),
            Size = new Size(436, 20)
        };

        _btnPair = new Button
        {
            Text = "Save & Connect",
            BackColor = Color.FromArgb(2, 132, 199),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 9, FontStyle.Bold),
            Location = new Point(220, 234),
            Size = new Size(130, 34),
            Cursor = Cursors.Hand
        };
        _btnPair.FlatAppearance.BorderSize = 0;
        _btnPair.Click += OnPairClicked;

        _btnCancel = new Button
        {
            Text = "Cancel",
            Font = new Font("Segoe UI", 9),
            Location = new Point(360, 234),
            Size = new Size(100, 34)
        };
        _btnCancel.Click += (s, e) => Close();

        Controls.Add(lblHeader);
        Controls.Add(lblSub);
        Controls.Add(lblApi);
        Controls.Add(_txtApiUrl);
        Controls.Add(lblToken);
        Controls.Add(_txtToken);
        Controls.Add(_lblStatus);
        Controls.Add(_btnPair);
        Controls.Add(_btnCancel);
    }

    private void OnPairClicked(object? sender, EventArgs e)
    {
        string url = _txtApiUrl.Text.Trim();
        string token = _txtToken.Text.Trim();

        if (!ConfigManager.ValidateApiUrl(url, out string? urlError))
        {
            _lblStatus.Text = urlError;
            return;
        }

        if (string.IsNullOrWhiteSpace(token) || token.Length < 32)
        {
            _lblStatus.Text = "Please enter a valid 32-byte hexadecimal device token.";
            return;
        }

        try
        {
            _config.ApiBaseUrl = url;
            ConfigManager.Save(_config);
            SecurityUtil.SaveToken(token);

            IsPairedSuccessfully = true;
            MessageBox.Show(
                "Device paired successfully! The background agent is now connected to your EasyPrint shop.",
                "EasyPrint Paired",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            Close();
        }
        catch (Exception ex)
        {
            _lblStatus.Text = $"Pairing error: {ex.Message}";
        }
    }
}
