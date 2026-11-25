using System.IO.Pipes;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace FileDesk.Desktop.Runtime;

/// <summary>A per-user, per-project instance lock with a local activation channel.</summary>
public sealed class SingleInstance : IDisposable {
    private readonly Mutex mutex;
    private readonly string pipeName;
    private readonly CancellationTokenSource cancellation = new();
    public bool IsPrimary { get; }

    public SingleInstance(string root) {
        var identity = WindowsIdentity.GetCurrent().User?.Value ?? Environment.UserName;
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity + "|" + root.ToUpperInvariant())))[..24];
        pipeName = "FileDesk-activate-" + key;
        mutex = new Mutex(true, "Local\\FileDesk-" + key, out var created);
        IsPrimary = created;
    }

    public async Task ActivateExistingAsync() {
        using var client = new NamedPipeClientStream(".", pipeName, PipeDirection.Out, PipeOptions.Asynchronous);
        await client.ConnectAsync(5000);
        using var writer = new StreamWriter(client, new UTF8Encoding(false)) { AutoFlush = true };
        await writer.WriteLineAsync("show");
    }

    public async Task ListenAsync(Action show) {
        try {
            while (!cancellation.IsCancellationRequested) {
                using var pipe = new NamedPipeServerStream(pipeName, PipeDirection.In, 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await pipe.WaitForConnectionAsync(cancellation.Token);
                using var reader = new StreamReader(pipe);
                var command = await reader.ReadLineAsync(cancellation.Token);
                if (command == "show") show();
            }
        } catch (OperationCanceledException) { }
    }

    public void Dispose() {
        cancellation.Cancel();
        if (IsPrimary) mutex.ReleaseMutex();
        mutex.Dispose();
        cancellation.Dispose();
    }
}
