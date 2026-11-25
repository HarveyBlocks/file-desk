using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using FileDesk.Desktop.Runtime;
using Xunit;

namespace FileDesk.Tests;

/// <summary>Exercise the actual C# owner and built Next host against disposable storage.</summary>
public class ProductionTests {
    [Fact]
    public async Task PortConflictRetryCrashBusyExitAndCleanup() {
        var project = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../"));
        var root = Path.Combine(Path.GetTempPath(), "FileDesk-desktop-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var link = Path.Combine(root, "Web");
        var source = Path.Combine(project, "Web");
        var linkStart = new ProcessStartInfo("cmd.exe") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true };
        linkStart.Arguments = $"/c mklink /J \"{link}\" \"{source}\"";
        using var linkProcess = Process.Start(linkStart)!;
        await linkProcess.WaitForExitAsync();
        Assert.Equal(0, linkProcess.ExitCode);
        using var service = new ServiceProcess(new ProjectLayout(root));
        var logs = new System.Collections.Concurrent.ConcurrentQueue<string>();
        service.Log += logs.Enqueue;
        var listener = new TcpListener(IPAddress.Any, 13453);
        try {
            listener.Start();
            await service.StartAsync();
            Assert.Equal("failed", service.State);
            Assert.Contains(logs, line => line.Contains("EADDRINUSE", StringComparison.Ordinal));
            listener.Stop();

            await service.StartAsync();
            Assert.Equal("running", service.State);
            var firstPid = service.ProcessId;
            await service.StartAsync();
            Assert.Equal(firstPid, service.ProcessId);
            using var client = new HttpClient { BaseAddress = new Uri("http://127.0.0.1:13453"), Timeout = TimeSpan.FromSeconds(10) };
            Assert.True((await client.GetAsync("/api/entries")).IsSuccessStatusCode);

            using (var owned = Process.GetProcessById(service.ProcessId!.Value)) {
                owned.Kill();
                await owned.WaitForExitAsync();
            }
            await Until(() => service.State == "failed");
            await service.StartAsync();
            Assert.Equal("running", service.State);

            using var upload = new TcpClient();
            await upload.ConnectAsync(IPAddress.Loopback, 13453);
            var stream = upload.GetStream();
            var header = "PUT /api/files/incomplete.bin HTTP/1.1\r\nHost: 127.0.0.1:13453\r\nOrigin: http://127.0.0.1:13453\r\nContent-Length: 1048576\r\n\r\n";
            await stream.WriteAsync(Encoding.ASCII.GetBytes(header));
            await stream.WriteAsync(new byte[32768]);
            await Until(() => service.Tasks.Any(task => task.Operation == "Upload" && task.Completed >= 32768));
            Assert.False(await service.RequestExitAsync());
            Assert.True((await client.GetAsync("/api/entries")).IsSuccessStatusCode);
            await service.StopAsync(true);
            Assert.Null(service.ProcessId);
            Assert.Empty(Directory.GetFileSystemEntries(Path.Combine(root, "temp", "transfers")));
            Assert.False(File.Exists(Path.Combine(root, "data", "incomplete.bin")));

            await service.StartAsync();
            await Until(() => service.Tasks.Length == 0);
            Assert.True(await service.RequestExitAsync());
            await service.StopAsync(false);
            Assert.Null(service.ProcessId);
        } finally {
            listener.Stop();
            service.Dispose();
            // Remove the owned junction itself before deleting fixture storage.
            Directory.Delete(link);
            Directory.Delete(root, true);
        }
    }

    private static async Task Until(Func<bool> condition) {
        for (var attempt = 0; attempt < 200; attempt++) {
            if (condition()) return;
            await Task.Delay(50);
        }
        Assert.Fail("Timed out waiting for the expected service state.");
    }
}
