import path from "node:path";
import type { FileStore } from "./storage";
import { openFile, passiveType, previewFile } from "./preview";
import { streamResponse } from "./streamResponse";
import { requireActive } from "./errors";

/** ASCII fallback plus RFC 5987 preserve Unicode names without header injection. */
export function contentDisposition(name: string, inline = false): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\;]/gu, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Only a single byte range is accepted; suffix and open-ended ranges are supported. */
export function byteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size
    ? { start, end } : null;
}

/** Stream an opened descriptor so cancellation closes the file instead of buffering it. */
export async function downloadFile(store: FileStore, relative: string, request: Request): Promise<Response> {
  requireActive(request.signal);
  const file = await openFile(store, relative);
  try {
    const { size } = await file.stat();
    const requestedInline = new URL(request.url).searchParams.get("disposition") === "inline";
    const inline = requestedInline && (Boolean(passiveType(relative)) || (await previewFile(store, relative)).kind === "text");
    const nativePdf = inline && passiveType(relative)?.kind === "pdf";
    const headers = new Headers({
      "Cache-Control": "no-store", "Accept-Ranges": "bytes",
      "Content-Type": inline ? passiveType(relative)?.mime ?? "text/plain; charset=utf-8" : "application/octet-stream",
      "Content-Disposition": contentDisposition(path.basename(relative), inline),
      "X-Content-Type-Options": "nosniff",
      // Native PDF plugins cannot run inside CSP sandbox. They render in the
      // browser's isolated viewer; all other resource documents remain sandboxed.
      "Content-Security-Policy": nativePdf
        ? "default-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"
        : "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    const rangeHeader = request.headers.get("range");
    const range = rangeHeader ? byteRange(rangeHeader, size) : undefined;
    if (range === null) {
      await file.close();
      headers.set("Content-Range", `bytes */${size}`);
      headers.set("Content-Type", "application/json");
      return Response.json({ code: "INVALID_RANGE", message: "The requested byte range is not satisfiable." }, { status: 416, headers });
    }
    if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("Content-Length", String(range ? range.end - range.start + 1 : size));
    requireActive(request.signal);
    const stream = file.createReadStream({ ...(range ?? {}), autoClose: true });
    return streamResponse(stream, { status: range ? 206 : 200, headers }, request.signal);
  } catch (error) {
    await file.close();
    throw error;
  }
}
