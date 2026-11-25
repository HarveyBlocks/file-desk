using System.Diagnostics;
using System.IO.Pipes;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace FileDesk.Desktop.Runtime;

/// <summary>Own one production host, its private control pipe and its Windows job.</summary>
public sealed class ServiceProcess : IDisposable {
    private readonly ProjectLayout layout;
    private Process? process;
    private ProcessJob? job;
    private NamedPipeServerStream? pipe;
    private StreamWriter? writer;
    private readonly SemaphoreSlim writeLock = new(1, 1);
    private Task? controlReader;
    private TaskCompletionSource<bool>? ready;
    private TaskCompletionSource<bool>? exitDecision;
    private bool stopping;
    private bool disposed;
    public string State { get; private set; } = "stopped";
    public ServiceTask[] Tasks { get; private set; } = [];
    public int? ProcessId => process is { HasExited: false } ? process.Id : null;
    public event Action<string>? Log;
    public event Action? Changed;

    public ServiceProcess(ProjectLayout layout) { this.layout = layout; }

    /// <summary>Validate prerequisites and wait for the authenticated host to become ready.</summary>
    public async Task StartAsync() {
        if (process is { HasExited: false }) return;
        ReleaseProcess();
        stopping = false;
        ready = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        State = "starting";
        Tasks = [];
        Changed?.Invoke();
        try {
            var node = layout.ValidateAndFindNode();
            var pipeName = "FileDesk-service-" + Guid.NewGuid().ToString("N");
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            pipe = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1,
                PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            job = new ProcessJob();
            var start = new ProcessStartInfo(node) {
                WorkingDirectory = layout.Web, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
            };
            start.ArgumentList.Add(layout.Host);
            start.Environment["FILEDESK_ROOT"] = layout.Root;
            start.Environment["FILEDESK_PIPE"] = @"\\.\pipe\" + pipeName;
            start.Environment["FILEDESK_TOKEN"] = token;
            start.Environment["PORT"] = "13453";
            start.Environment["HOSTNAME"] = "0.0.0.0";
            process = new Process { StartInfo = start, EnableRaisingEvents = true };
            process.OutputDataReceived += (_, args) => { if (args.Data is not null) Log?.Invoke(args.Data); };
            process.ErrorDataReceived += (_, args) => { if (args.Data is not null) Log?.Invoke(args.Data); };
            var ownedProcess = process;
            process.Exited += (_, _) => {
                if (!ReferenceEquals(process, ownedProcess)) return;
                ready?.TrySetResult(false);
                exitDecision?.TrySetResult(true);
                Tasks = [];
                State = stopping ? "stopped" : "failed";
                Changed?.Invoke();
                if (!stopping) Log?.Invoke("The service exited unexpectedly. Select Retry to start it again.");
            };
            if (!process.Start()) throw new InvalidOperationException("The service process did not start.");
            // The host waits for our welcome before loading Next.js. Assignment
            // therefore happens before the host is allowed to create descendants.
            job.Assign(process);
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await pipe.WaitForConnectionAsync(timeout.Token);
            var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, true);
            var hello = ControlMessage.Parse(await reader.ReadLineAsync(timeout.Token) ?? "");
            if (hello.Type != "hello" || hello.Token != token) throw new InvalidDataException("Service authentication failed.");
            writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true };
            await SendAsync("welcome");
            controlReader = ReadControlAsync(reader, ownedProcess);
            if (!await ready.Task.WaitAsync(TimeSpan.FromSeconds(45))) throw new IOException("Service startup failed. Check the preceding log entries.");
        } catch (Exception error) {
            State = "failed";
            Log?.Invoke(error.Message);
            ReleaseProcess();
            Changed?.Invoke();
        }
    }

    private async Task ReadControlAsync(StreamReader reader, Process ownedProcess) {
        try {
            while (await reader.ReadLineAsync() is { } line) {
                if (!ReferenceEquals(process, ownedProcess)) return;
                var message = ControlMessage.Parse(line);
                if (message.Type is "state" or "tasks" or "busy") Tasks = message.Tasks;
                if (message.Type == "state") {
                    State = message.State ?? "failed";
                    if (State == "running") ready?.TrySetResult(true);
                    if (State == "stopping") { stopping = true; exitDecision?.TrySetResult(true); }
                }
                if (message.Type == "busy") exitDecision?.TrySetResult(false);
                if (message.Type == "error") {
                    State = "failed";
                    ready?.TrySetResult(false);
                    Log?.Invoke((message.Code ?? "SERVICE_ERROR") + ": " + message.Message);
                }
                Changed?.Invoke();
            }
        } catch (Exception error) when (error is IOException or ObjectDisposedException or InvalidDataException or JsonException) {
            if (!stopping && !disposed && ReferenceEquals(process, ownedProcess)) {
                State = "failed";
                Log?.Invoke("Service control connection failed. " + error.Message);
                job?.Dispose();
                Changed?.Invoke();
            }
        } finally { reader.Dispose(); }
    }

    /// <summary>Ask the host to atomically exit only if no operation is active.</summary>
    public async Task<bool> RequestExitAsync() {
        if (process is null || process.HasExited) return true;
        exitDecision = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        await SendAsync("exit");
        try { return await exitDecision.Task.WaitAsync(TimeSpan.FromSeconds(5)); }
        catch (TimeoutException) { throw new IOException("The service did not answer the exit request."); }
    }

    /// <summary>Cancel when requested, allow cleanup, then enforce the owned-process deadline.</summary>
    public async Task StopAsync(bool force) {
        stopping = true;
        try {
            if (process is { HasExited: false }) {
                if (force) await SendAsync("terminate");
                await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(10));
                if (process.ExitCode != 0) Log?.Invoke("The service exited with a failure or forced-shutdown code.");
            }
        } catch (Exception error) when (error is IOException or TimeoutException or InvalidOperationException) {
            Log?.Invoke("Graceful shutdown did not complete. Ending the owned service process. " + error.Message);
        } finally {
            ReleaseProcess();
            State = "stopped";
            Tasks = [];
            Changed?.Invoke();
        }
    }

    private async Task SendAsync(string type) {
        if (writer is null) throw new IOException("Service control is not connected.");
        await writeLock.WaitAsync();
        try { await writer.WriteLineAsync(JsonSerializer.Serialize(new { version = 1, type })); }
        finally { writeLock.Release(); }
    }

    private void ReleaseProcess() {
        // Close the job first so every owned child is stopped, even after startup failure.
        var ownedProcess = process;
        process = null;
        job?.Dispose();
        job = null;
        pipe?.Dispose();
        pipe = null;
        writer = null;
        ownedProcess?.Dispose();
    }

    public void Dispose() {
        disposed = true;
        stopping = true;
        ReleaseProcess();
        writeLock.Dispose();
    }
}
