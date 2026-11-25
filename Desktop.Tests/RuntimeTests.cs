using System.Diagnostics;
using System.Text.Json;
using FileDesk.Desktop.Runtime;
using Microsoft.Win32;
using Xunit;

namespace FileDesk.Tests;

public class RuntimeTests {
    [Fact]
    public void ProtocolRejectsWrongVersionAndOversizedFrames() {
        Assert.Throws<InvalidDataException>(() => ControlMessage.Parse("{\"version\":2,\"type\":\"state\"}"));
        Assert.Throws<InvalidDataException>(() => ControlMessage.Parse(new string('a', 65537)));
        Assert.Throws<JsonException>(() => ControlMessage.Parse("not json"));
        var message = ControlMessage.Parse("{\"version\":1,\"type\":\"state\",\"state\":\"running\",\"tasks\":[]}");
        Assert.Equal("running", message.State);
    }

    [Fact]
    public void ProgressDistinguishesUnknownTotalsAndServerBytes() {
        var unknown = new ServiceTask { Operation = "ZIP", Completed = 100 };
        Assert.True(unknown.Indeterminate);
        Assert.Contains("sent by server", unknown.ProgressText);
        var known = new ServiceTask { Completed = 50, Total = 100 };
        Assert.Equal(50, known.Percentage);
        Assert.False(known.Indeterminate);
        Assert.Equal(100, (known with { Completed = 120 }).Percentage);
        Assert.Contains("entries", (known with { Unit = "entries" }).ProgressText);
    }

    [Fact]
    public void ProjectRootIsIndependentOfWorkingDirectory() {
        var root = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "File Desk"));
        Assert.Equal(root, ProjectLayout.FromArguments(["--project-root", root]).Root);
        Assert.Throws<ArgumentException>(() => ProjectLayout.FromArguments(["--project-root"]));
        Assert.Throws<ArgumentException>(() => ProjectLayout.FromArguments(["--project-root", "relative"]));
    }

    [Fact]
    public void MissingApplicationProducesActionableFailure() {
        var layout = new ProjectLayout(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N")));
        Assert.Contains("Web application", Assert.Throws<InvalidOperationException>(() => layout.ValidateAndFindNode()).Message);
    }

    [Fact]
    public void StartupRegistrationTouchesOnlyItsUniqueTestEntry() {
        var name = "FileDesk-test-" + Guid.NewGuid().ToString("N");
        var startup = new StartupRegistration(@"C:\Example Folder\FileDesk.exe", @"C:\Example Folder", name);
        try {
            Assert.False(startup.Enabled);
            startup.SetEnabled(true);
            Assert.True(startup.Enabled);
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
            Assert.Equal("\"C:\\Example Folder\\FileDesk.exe\" --autostart --project-root \"C:\\Example Folder\"", key!.GetValue(name));
            startup.SetEnabled(false);
            Assert.False(startup.Enabled);
        } finally { startup.SetEnabled(false); }
    }

    // Named mutex ownership must be released on the acquiring thread.
#pragma warning disable xUnit1031
    [Fact]
    public void SecondInstanceActivatesPrimaryWithoutTakingItsLock() {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"));
        using var primary = new SingleInstance(root);
        Assert.True(primary.IsPrimary);
        var activated = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = primary.ListenAsync(() => activated.TrySetResult());
        using var secondary = new SingleInstance(root);
        Assert.False(secondary.IsPrimary);
        secondary.ActivateExistingAsync().GetAwaiter().GetResult();
        Assert.True(activated.Task.Wait(TimeSpan.FromSeconds(5)));
    }

#pragma warning restore xUnit1031

    [Fact]
    public void ClosingJobTerminatesOwnedProcess() {
        using var process = Process.Start(new ProcessStartInfo("ping.exe", "-t 127.0.0.1") {
            CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true,
        })!;
        try {
            using (var job = new ProcessJob()) { job.Assign(process); }
            Assert.True(process.WaitForExit(5000));
        } finally { if (!process.HasExited) process.Kill(true); }
    }
}
