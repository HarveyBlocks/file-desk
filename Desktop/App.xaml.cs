using System.Windows;
using FileDesk.Desktop.Runtime;
using Forms = System.Windows.Forms;
using Drawing = System.Drawing;

namespace FileDesk.Desktop;

/// <summary>Own the tray independently of log-window visibility and service state.</summary>
public partial class App : Application {
    private SingleInstance? instance;
    private ServiceProcess? service;
    private MainWindow? logs;
    private ExitWindow? exitWindow;
    private Forms.NotifyIcon? tray;
    private Drawing.Icon? applicationIcon;
    private Forms.ToolStripMenuItem? status;
    private Forms.ToolStripMenuItem? startupItem;
    private StartupRegistration? startup;
    private bool exiting;

    protected override async void OnStartup(StartupEventArgs args) {
        base.OnStartup(args);
        try {
            var layout = ProjectLayout.FromArguments(args.Args);
            instance = new SingleInstance(layout.Root);
            if (!instance.IsPrimary) {
                await instance.ActivateExistingAsync();
                Shutdown();
                return;
            }
            service = new ServiceProcess(layout);
            logs = new MainWindow(service);
            MainWindow = logs;
            startup = new StartupRegistration(Environment.ProcessPath!, layout.Root);
            BuildTray();
            service.Log += text => logs.Append(text);
            service.Changed += () => Dispatcher.BeginInvoke(() => {
                logs.RefreshStatus();
                if (status is not null) status.Text = "Service: " + service.State;
                exitWindow?.UpdateTasks(service.Tasks);
            });
            _ = instance.ListenAsync(() => Dispatcher.BeginInvoke(() => logs.Restore()));
            if (!args.Args.Contains("--autostart")) logs.Show();
            await service.StartAsync();
        } catch (Exception error) {
            MessageBox.Show(error.Message, "File Desk", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
        }
    }

    private void BuildTray() {
        var menu = new Forms.ContextMenuStrip();
        status = new Forms.ToolStripMenuItem("Service: starting") { Enabled = false };
        menu.Items.Add(status);
        menu.Items.Add("Show logs", null, (_, _) => Dispatcher.BeginInvoke(() => logs?.Restore()));
        startupItem = new Forms.ToolStripMenuItem("Start with Windows") { Checked = startup!.Enabled };
        startupItem.Click += (_, _) => {
            try {
                startup.SetEnabled(!startup.Enabled);
                startupItem.Checked = startup.Enabled;
            } catch (Exception error) {
                logs?.Append("Startup registration failed. " + error.Message);
                MessageBox.Show("Startup registration failed. " + error.Message, "File Desk");
            }
        };
        menu.Items.Add(startupItem);
        menu.Items.Add(new Forms.ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => Dispatcher.BeginInvoke(async () => await ExitAsync()));
        using var iconStream = Application.GetResourceStream(new Uri("pack://application:,,,/FileDesk;component/Assets/file-desk.ico")).Stream;
        applicationIcon = new Drawing.Icon(iconStream);
        tray = new Forms.NotifyIcon { Text = "File Desk", Icon = applicationIcon, ContextMenuStrip = menu, Visible = true };
        tray.DoubleClick += (_, _) => Dispatcher.BeginInvoke(() => logs?.Restore());
    }

    private async Task ExitAsync() {
        if (exiting || service is null) return;
        exiting = true;
        try {
            var canExit = await service.RequestExitAsync();
            if (!canExit) {
                exitWindow = new ExitWindow();
                exitWindow.UpdateTasks(service.Tasks);
                var terminate = exitWindow.ShowDialog() == true;
                exitWindow = null;
                if (!terminate) return;
            }
            await service.StopAsync(!canExit);
            if (logs is not null) { logs.AllowClose = true; logs.Close(); }
            Shutdown();
        } catch (Exception error) {
            logs?.Append("Exit control failed. " + error.Message);
            var terminate = MessageBox.Show("The service did not respond. End its owned processes and exit?",
                "Exit File Desk", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes;
            if (terminate) { await service.StopAsync(true); Shutdown(); }
        } finally { exiting = false; }
    }

    protected override void OnSessionEnding(SessionEndingCancelEventArgs args) {
        // Windows logout must not be blocked by a hidden task-confirmation dialog.
        service?.Dispose();
        base.OnSessionEnding(args);
        Shutdown();
    }

    protected override void OnExit(ExitEventArgs args) {
        tray?.Dispose();
        applicationIcon?.Dispose();
        service?.Dispose();
        instance?.Dispose();
        base.OnExit(args);
    }
}
