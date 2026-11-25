using Microsoft.Win32;

namespace FileDesk.Desktop.Runtime;

/// <summary>Manage only FileDesk's current-user login entry, without elevation.</summary>
public sealed class StartupRegistration {
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private readonly string valueName;
    private readonly string command;

    public StartupRegistration(string executable, string root, string name = "FileDesk") {
        valueName = name;
        command = Quote(executable) + " --autostart --project-root " + Quote(root);
    }

    public bool Enabled {
        get { using var key = Registry.CurrentUser.OpenSubKey(RunKey); return key?.GetValue(valueName) as string == command; }
    }

    public void SetEnabled(bool enabled) {
        using var key = Registry.CurrentUser.CreateSubKey(RunKey, true);
        if (enabled) key.SetValue(valueName, command, RegistryValueKind.String);
        else key.DeleteValue(valueName, false);
    }

    private static string Quote(string value) {
        if (value.Contains('"')) throw new ArgumentException("Windows paths cannot contain quotes.");
        // Quote trailing backslashes correctly for Windows command-line parsing.
        return "\"" + value.TrimEnd('\\') + "\"";
    }
}
