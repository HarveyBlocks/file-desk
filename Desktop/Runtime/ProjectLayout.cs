using System.Diagnostics;

namespace FileDesk.Desktop.Runtime;

/// <summary>All application paths derive from one explicit, absolute project root.</summary>
public sealed record ProjectLayout(string Root) {
    public string Web => Path.Combine(Root, "Web");
    public string Host => Path.Combine(Web, "host", "server.mjs");

    public static ProjectLayout FromArguments(string[] arguments) {
        var index = Array.IndexOf(arguments, "--project-root");
        if (index >= 0 && index + 1 >= arguments.Length)
            throw new ArgumentException("--project-root requires an absolute directory.");
        var root = index >= 0 ? arguments[index + 1] : AppContext.BaseDirectory;
        if (!Path.IsPathFullyQualified(root)) throw new ArgumentException("The project root must be absolute.");
        return new ProjectLayout(Path.TrimEndingDirectorySeparator(Path.GetFullPath(root)));
    }

    public string ValidateAndFindNode() {
        if (!File.Exists(Path.Combine(Web, "package.json")) || !File.Exists(Host))
            throw new InvalidOperationException("Web application not found. Keep FileDesk.exe in the project root, or pass --project-root.");
        if (!File.Exists(Path.Combine(Web, "node_modules", "next", "package.json")))
            throw new InvalidOperationException("Web dependencies are missing. Run npm ci in Web.");
        if (!File.Exists(Path.Combine(Web, ".next", "BUILD_ID")))
            throw new InvalidOperationException("Production build is missing. Run npm run build in Web.");
        foreach (var directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)) {
            var candidate = Path.Combine(directory.Trim('"'), "node.exe");
            if (File.Exists(candidate)) {
                using var probe = Process.Start(new ProcessStartInfo(candidate, "--version") {
                    UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true,
                }) ?? throw new InvalidOperationException("Node.js could not start.");
                if (!probe.WaitForExit(5000)) { probe.Kill(true); throw new InvalidOperationException("Node.js version check timed out."); }
                var version = probe.StandardOutput.ReadToEnd().Trim().TrimStart('v');
                if (probe.ExitCode != 0 || !Version.TryParse(version, out var parsed) || parsed < new Version(22, 13))
                    throw new InvalidOperationException("Node.js 22.13 or later is required.");
                return candidate;
            }
        }
        throw new InvalidOperationException("Node.js was not found on PATH. Install Node.js 22.13 or later.");
    }
}
