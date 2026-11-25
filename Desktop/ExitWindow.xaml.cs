using System.Windows;
using FileDesk.Desktop.Runtime;

namespace FileDesk.Desktop;

/// <summary>Show live task snapshots only while the user is deciding whether to exit.</summary>
public partial class ExitWindow : Window {
    public ExitWindow() { InitializeComponent(); }
    public void UpdateTasks(ServiceTask[] tasks) {
        TaskList.ItemsSource = tasks;
        var active = tasks.Length > 0;
        TaskList.Visibility = active ? Visibility.Visible : Visibility.Collapsed;
        Warning.Visibility = active ? Visibility.Visible : Visibility.Collapsed;
        Heading.Text = active ? "Tasks are still running" : "No tasks are running";
        TerminateButton.Content = active ? "Terminate and exit" : "Exit";
    }
    private void KeepRunning(object sender, RoutedEventArgs args) { DialogResult = false; }
    private void Terminate(object sender, RoutedEventArgs args) { DialogResult = true; }
}
