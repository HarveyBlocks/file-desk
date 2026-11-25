import path from "node:path";
import { Readable, type Readable as NodeReadable } from "node:stream";
import { ZipFile } from "yazl";
import type { FileEntry } from "../shared/files";
import { FileError, requireActive } from "./errors";
import { contentDisposition } from "./download";
import { openFile } from "./preview";
import type { FileStore } from "./storage";
import { streamResponse } from "./streamResponse";

/** Inspect the entire tree before sending headers so unsupported entries fail explicitly. */
async function collect(store: FileStore, relative: string, signal: AbortSignal): Promise<FileEntry[]> {
  requireActive(signal);
  const result: FileEntry[] = [];
  for (const entry of await store.list(relative)) {
    requireActive(signal);
    if (entry.type === "unsupported") throw new FileError("UNSUPPORTED", "The directory contains a link or unsupported resource.");
    result.push(entry);
    if (entry.type === "directory") result.push(...await collect(store, entry.path, signal));
  }
  return result;
}

/** ZIP input is opened lazily: one large tree must not exhaust file descriptors. */
export async function downloadArchive(store: FileStore, relative: string, request: Request): Promise<Response> {
  requireActive(request.signal);
  await store.paths.directory(relative);
  const entries = await collect(store, relative, request.signal);
  const top = relative ? path.posix.basename(relative) : "data";
  const zip = new ZipFile();
  const output = zip.outputStream as Readable;
  const active = new Set<NodeReadable>();
  output.once("close", () => {
    for (const stream of active) stream.destroy();
  });
  zip.on("error", error => output.destroy(error));
  zip.addEmptyDirectory(top + "/");
  for (const entry of entries) {
    const suffix = relative ? entry.path.slice(relative.length + 1) : entry.path;
    const name = `${top}/${suffix}`;
    if (entry.type === "directory") {
      zip.addEmptyDirectory(name + "/", { mtime: new Date(entry.modifiedAt) });
    } else {
      zip.addReadStreamLazy(name, { mtime: new Date(entry.modifiedAt) }, callback => {
        void (async () => {
          requireActive(request.signal);
          // Recheck every path when it is opened: a scan is not a filesystem snapshot.
          const file = await openFile(store, entry.path);
          if (request.signal.aborted || output.destroyed) {
            await file.close();
            throw new FileError("CANCELLED", "The download was cancelled.");
          }
          const stream = file.createReadStream({ autoClose: true });
          active.add(stream);
          stream.once("close", () => active.delete(stream));
          callback(null, stream);
        })().catch(error => callback(error, Readable.from([])));
      });
    }
  }
  // Own the output before end() can open lazy file streams or observe an abort.
  const response = streamResponse(output, { headers: {
    "Content-Type": "application/zip", "Content-Disposition": contentDisposition(`${top}.zip`),
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } }, request.signal);
  zip.end();
  return response;
}
