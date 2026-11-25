using System.Collections.Concurrent;
using System.ComponentModel;
using System.Text;
using System.Windows.Documents;
using System.Windows;
using System.Windows.Threading;
using FileDesk.Desktop.Runtime;

namespace FileDesk.Desktop;

/// <summary>A bounded, selectable log view. Closing it only hides the window.</summary>
public partial class MainWindow : Window {
    private readonly ConcurrentQueue<string> pending = new();
    private readonly StringBuilder rendered = new();
    private readonly DispatcherTimer timer;
    private readonly ServiceProcess service;
    public bool AllowClose { get; set; }

    public MainWindow(ServiceProcess service) {
        InitializeComponent();
        this.service = service;
        timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(150) };
        timer.Tick += (_, _) => Flush();
        timer.Start();
    }

    public void Append(string text) {
        var timestamp = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd HH:mm:ss");
        pending.Enqueue(timestamp + "  " + text);
        while (pending.Count > 2000) pending.TryDequeue(out _);
    }

    private void Flush() {
        var lines = new List<string>();
        while (lines.Count < 200 && pending.TryDequeue(out var line)) lines.Add(line);
        if (lines.Count == 0) return;
        var batch = string.Join(Environment.NewLine, lines) + Environment.NewLine;
        rendered.Append(batch);
        if (rendered.Length > 250000) {
            var text = rendered.ToString();
            var start = text.IndexOf('\n', text.Length - 200000);
            rendered.Clear().Append(text[(start + 1)..]);
            LogText.Document.Blocks.Clear();
            LogText.AppendText(rendered.ToString());
        } else {
            LogText.AppendText(batch);
        }
        if (AutoScroll.IsChecked == true) LogText.ScrollToEnd();
    }

    public void RefreshStatus() {
        StatusText.Text = service.State switch {
            "running" => "Running on port 13453",
            "starting" => "Starting",
            "stopping" => "Stopping",
            "failed" => "Service failed",
            _ => "Stopped",
        };
        RetryButton.Visibility = service.State == "failed" ? Visibility.Visible : Visibility.Collapsed;
    }

    public void Restore() {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void OnClosing(object? sender, CancelEventArgs args) {
        if (AllowClose) { timer.Stop(); return; }
        args.Cancel = true;
        Hide();
    }
    private void ClearLogs(object sender, RoutedEventArgs args) {
        while (pending.TryDequeue(out _)) { }
        rendered.Clear();
        LogText.Document.Blocks.Clear();
    }
    private async void RetryService(object sender, RoutedEventArgs args) { await service.StartAsync(); }
}
