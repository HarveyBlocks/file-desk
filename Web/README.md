# File Desk

A minimal internal file manager built with Next.js App Router and TypeScript. All managed resources live in `data/`; no database is used. Existing files, including any previous `messages.sqlite`, remain ordinary downloadable files.

## Run

Use Node.js 22.13 or later and npm. Start commands from the project root.

```sh
npm ci
npm run dev
```

Open `http://localhost:13453/files`. The development and production servers listen on `0.0.0.0:13453`.

For production:

```sh
npm run build
npm start
```

Persist the data directory separately from application dependencies and build output. Runtime content is excluded from build tracing.

## Use

The toolbar provides single-file upload, a new UTF-8 text file, a new folder, and a ZIP download of the current folder. Rows provide download and delete actions. Hover over an icon to see its action.

- On Windows, the page shows a server LAN address and its network name when available. Qualified addresses must belong to an active physical Ethernet or Wi-Fi adapter and use a usable private IPv4 address. Manually configured addresses rank before DHCP addresses, then default-route availability and the combined route/interface metric decide. Multiple candidates appear in a local selector. Changing the selection sends no request, and resource navigation preserves it. A full reload probes again and restores the recommended address. Probing is limited to eight seconds and requires access to Windows networking queries. Other platforms, denied or failed probes, and hosts without candidates show 'LAN address unavailable'; file operations remain available.
- Open a folder or file to navigate to its shareable `/files/<path>` URL. Refresh and browser history preserve the resource location.
- Files are limited to 100 MiB. Uploads preserve original bytes. New text preserves whitespace and uses LF line endings; empty files are allowed.
- Names must be single path components valid on Windows and POSIX. Existing names are never overwritten or automatically renamed.
- Deleting a folder permanently removes all its descendants after confirmation. The data root cannot be deleted.
- ZIP downloads contain hidden files, nested folders and empty folders, under the selected folder name (`data` for the root).
- Text previews show at most 1 MiB of valid UTF-8. HTML, SVG, JavaScript and Markdown are displayed as plain text. Binary files without a supported preview can still be downloaded.
- Raster images (PNG, JPEG, GIF, WebP, AVIF and BMP), PDF, MP3, WAV, OGG, M4A, MP4 and WebM use native browser previews. Playback depends on the browser's supported codecs.
- Links, junctions and special filesystem entries are marked unsupported. They are never opened through the application; ZIP rejects a tree containing them. Deleting a parent folder removes nested links without deleting their targets.

## Storage and access

`data/` is created on first access. All application paths derive from the process working directory. Uploads are staged in `temp/transfers` and published using an exclusive hard link, so data and staging must be on the same filesystem with hard-link support (for example, local NTFS or ext4). Failed or cancelled requests clean their staging directories. A process crash can leave an unpublished staging directory; remove abandoned staging only while the server is stopped.

File and ZIP downloads are streamed and stop when cancelled. ZIP is not a snapshot: external edits or deletion during a download can change its contents or interrupt it. Local filesystem access is trusted; the app is not an isolation boundary against another process concurrently replacing filesystem paths.

The app has no login. Restrict access through your internal network or reverse proxy; every admitted user can manage all resources. Preserve the public host and scheme when proxying, disable proxy response buffering for downloads, and allow upload bodies of at least 100 MiB. Mutating requests require an Origin header matching the request URL's origin.

## HTTP API

Paths are relative to data, use `/` separators, and are encoded one URL segment at a time. Directory creation is not recursive. Failures have a stable `{ code, message }` shape; consumers must use `code` instead of parsing message text.

| Method | Endpoint | Input / result |
| --- | --- | --- |
| GET | `/api/entries?path=...` | `{ entries }`; omitted or empty path lists the root |
| PUT | `/api/files/<path>` | Raw file bytes; returns `{ entry }` with status 201 |
| POST | `/api/text-files` | JSON `{ directory, name, content }`; returns `{ entry }` with status 201 |
| POST | `/api/directories` | JSON `{ directory, name }`; returns `{ entry }` with status 201 |
| DELETE | `/api/entries/<path>` | Deletes a file or folder; status 204 |
| GET | `/api/files/<path>` | Attachment download; supports a single HTTP byte range |
| GET | `/api/files/<path>?disposition=inline` | Restricted passive or plain-text preview; unsupported binary files remain attachments |
| GET | `/api/archives[/<path>]` | Streamed ZIP; omitted path selects the root |

Entries contain `name`, `path`, `type` (`file`, `directory`, or `unsupported`), `size` (bytes for regular files, otherwise null), and `modifiedAt` (ISO 8601). Common failures include `CONFLICT` (409), `NOT_FOUND` (404), `TOO_LARGE` (413), and `ORIGIN_REJECTED` (403). JSON requests are also bounded by actual incoming bytes to 100 MiB plus 64 KiB of envelope overhead; heavily escaped JSON may reach the body limit before the text-file limit.

## Development

```sh
npm run typecheck
npm test
npm run build
npm run test:integration
```

Tests use isolated OS temporary directories and never use the real data directory. Integration tests require a production build and run `next start` against an isolated copy; they stop that process and remove its files afterward. Dependencies are shared through a filesystem link while all test content and build files stay isolated. Tests cover the real Next.js route boundary, encoded navigation, upload/download, Range, ZIP, same-origin checks, deletion and cancelled transfers. Server modules separate path boundaries, storage, previews and transfer lifecycles; pages and API routes reuse those services. UI conventions are documented in [UI guidelines](docs/specification/UI.md).
