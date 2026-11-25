# Runtime boundaries

## Projects and storage

Desktop owns Windows integration. Web owns file behavior and HTTP rendering. Each project controls its own build and dependency versions. The root build script only composes those builds.

The production host derives its Web directory from its entrypoint, sets its working directory there and requires an absolute `FILEDESK_ROOT`. Desktop passes the configured root explicitly. Storage uses `data/` and `temp/transfers/` under that root. Tests inject isolated roots.

## Desktop control

A per-user, per-root mutex prevents duplicate instances. A current-user-only activation pipe restores the primary log window. The primary creates a separate random control pipe and a random handshake token for each service attempt.

Control frames are UTF-8 JSON lines with protocol version 1. The host sends `hello` with its token and waits for `welcome`. Desktop sends welcome after assigning the process to a Windows Job Object with kill-on-close behavior. Host messages include `state`, `tasks`, `busy` and structured `error` values. Commands include `snapshot`, `exit` and `terminate`. Log text is never parsed as state.

The host counts incoming bytes without starting the request stream prematurely. Response accounting observes public write APIs, including headers supplied directly to writeHead. A request stays registered until both its handler and response have finished. Async request context connects semantic storage progress to the host despite separately bundled Next.js route modules.

An exit command checks for active tasks and changes admission state in one synchronous step. Busy requests return a current snapshot without stopping admission. Terminate closes admission, aborts task signals and sockets, and waits for handlers, staging cleanup and Next.js closure. Desktop enforces a ten-second final process deadline.

## User interface

The WPF log window is independent of the tray lifetime. Closing it hides it. UI updates are dispatched to the UI thread, logs use a 20px line height at 12px font size and are bounded and batched, and task snapshots are shown only during exit confirmation. Task progress includes the operation, relative resource, phase, completed amount, optional total and unit.

Current-user login startup uses an absolute executable path and explicit root. Startup is initially off, and startup registration changes only the application's own registry value.
