# File Desk

File Desk combines a Next.js file manager with a Windows WPF launcher. Desktop and Web have independent dependencies, builds and tests. Managed content lives in the project-root `data/` directory.

## Build and run

Use Windows x64, Node.js 22.13 or later, the .NET 8 SDK for building, and .NET 8 Desktop Runtime for running. This project retains .NET 8 by explicit choice. Its Microsoft support ended on November 10, 2026.

From the project root, run:

```powershell
.\Build.ps1
```

The script delegates Web compilation to its npm scripts and Desktop publication to its C# project. It creates `FileDesk.exe` at the project root. Double-click that executable to start the production server and open the log window. The server listens on `0.0.0.0:13453`. Open [File Desk](http://localhost:13453/files) in a browser.

Keep the executable beside `Desktop/`, `Web/` and `data/`. A shortcut can start it from any working directory. For a debug build, pass the absolute project root:

```powershell
dotnet run --project Desktop -- --project-root D:\IT_study\source\temp\FileDesk
```

The launcher requires installed Web dependencies and a production build. It reports missing prerequisites in the log window. Use `Retry` after correcting a failure.

## Windows behavior

Closing the log window hides it. The service continues until you choose `Exit` in the tray menu. Double-click the tray icon or select `Show logs` to restore the window. Opening FileDesk again activates the existing instance.

The log window supports selection, copying, clearing the displayed log and auto-scroll. Its bounded display buffer is refreshed in batches. Timestamps use UTC+8 without a timezone label. Logs are kept in memory.

`Start with Windows` is disabled by default. Enabling it registers only a FileDesk entry in the current user's login startup registry key. Login startup runs with a hidden log window and a visible tray icon. Moving the project requires disabling and enabling startup again from its new location. An actual Windows sign-out/sign-in is the final manual check for login startup.

If tasks are active when exiting, a live confirmation lists their operations, resource paths and progress. Choose `Keep running` or `Terminate and exit`. Downloads report bytes sent by the server. Unknown totals use indeterminate progress. The service keeps accepting requests while you decide.

Termination cancels active transfers and waits for cleanup. Completed writes and deletions stay applied. Cancelling a folder deletion can leave part of the folder intact. If shutdown exceeds ten seconds, the launcher ends its owned process job. Windows logout or an unexpected launcher exit also ends the owned process tree.

## Development

Web commands belong in `Web/`:

```powershell
cd Web
npm ci
npm run dev
npm run typecheck
npm test
npm run test:host
npm run build
npm run test:integration
npm run test:desktop-host
```

Web can run without the desktop launcher. Its normal CLI commands derive the data root from the parent of the Web working directory. `FILEDESK_ROOT` can specify an explicit absolute root for isolated deployments and tests.

Desktop commands belong to its projects:

```powershell
dotnet build Desktop/Desktop.csproj
dotnet test Desktop.Tests/Desktop.Tests.csproj
```

The desktop production host exchanges versioned JSON messages over an authenticated, current-user-only Windows named pipe. Human-readable logs are separate from control messages. A Windows Job Object owns the host and descendants.

File management, HTTP endpoints, restrictions and network-address selection are described in [Web documentation](Web/README.md). The web interface follows [UI guidelines](Web/docs/specification/UI.md). Data and temporary uploads are excluded from version control and build output.

## Git workflow

Use the develop branch for daily work and frequent commits. Its upstream is origin/develop in the GitHub repository. Commit messages use English and Conventional Commits.

```powershell
git switch develop
git add <changed-files>
git commit -m "fix: describe the change"
git push
```
