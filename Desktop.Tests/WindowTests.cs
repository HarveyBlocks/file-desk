using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Threading;
using FileDesk.Desktop;
using FileDesk.Desktop.Runtime;
using Xunit;

namespace FileDesk.Tests;

public class WindowTests {
    [Fact]
    public async Task LogSpacingCloseRestoreAndTaskVisibility() {
        var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() => {
            MainWindow? window = null;
            ExitWindow? exit = null;
            using var service = new ServiceProcess(new ProjectLayout(Path.GetTempPath()));
            try {
                window = new MainWindow(service);
                window.Show();
                window.Append("First readable line");
                window.Append("Second readable line");
                var frame = new DispatcherFrame();
                var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(350) };
                timer.Tick += (_, _) => { timer.Stop(); frame.Continue = false; };
                timer.Start();
                Dispatcher.PushFrame(frame);
                var log = (RichTextBox)window.FindName("LogText");
                Assert.Equal(20, log.Document.LineHeight);
                Assert.Contains("First readable line", new TextRange(log.Document.ContentStart, log.Document.ContentEnd).Text);
                Assert.True(log.IsReadOnly);
                window.Close();
                Assert.False(window.IsVisible);
                window.Restore();
                Assert.True(window.IsVisible);

                exit = new ExitWindow();
                exit.UpdateTasks([new ServiceTask { Operation = "Upload", Completed = 50, Total = 100 }]);
                Assert.Equal(Visibility.Visible, ((ListBox)exit.FindName("TaskList")).Visibility);
                exit.UpdateTasks([]);
                Assert.Equal(Visibility.Collapsed, ((ListBox)exit.FindName("TaskList")).Visibility);
                Assert.Equal("Exit", ((Button)exit.FindName("TerminateButton")).Content);
                done.TrySetResult();
            } catch (Exception error) { done.TrySetException(error); }
            finally {
                if (window is not null) { window.AllowClose = true; window.Close(); }
                exit?.Close();
            }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.IsBackground = true;
        thread.Start();
        await done.Task.WaitAsync(TimeSpan.FromSeconds(10));
    }
}
