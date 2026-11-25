import path from "node:path";
import { createWriteStream } from "node:fs";
import { link, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { childPath, MAX_FILE_BYTES, parentPath, type FileEntry } from "../shared/files";
import { FileError, requireActive } from "./errors";
import { DataPaths, validatePath } from "./paths";

/** Filesystem operations accept an injected root so tests never touch real data. */
export class FileStore {
  readonly paths: DataPaths;

  constructor(root: string, private readonly transferRoot: string) {
    this.paths = new DataPaths(root);
  }

  /** Resolve metadata without opening content or following a linked entry. */
  async entry(relative: string): Promise<FileEntry> {
    const target = await this.paths.resolve(relative);
    return this.describe(relative, target);
  }

  private async describe(relative: string, absolute: string): Promise<FileEntry> {
    const stat = await lstat(absolute);
    return {
      name: path.basename(absolute), path: relative,
      type: stat.isSymbolicLink() ? "unsupported" : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "unsupported",
      size: stat.isFile() ? stat.size : null,
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  /** Return a fresh direct-child snapshot; unsupported resources remain visible. */
  async list(relative: string): Promise<FileEntry[]> {
    const directory = await this.paths.directory(relative);
    const entries = await Promise.all((await readdir(directory)).map(name =>
      this.describe(childPath(relative, name), path.join(directory, name))));
    return entries.sort((a, b) =>
      Number(b.type === "directory") - Number(a.type === "directory") || a.name.localeCompare(b.name, "en"));
  }

  /** Only the requested child is created; missing parents and collisions are errors. */
  async createDirectory(directory: string, name: string): Promise<FileEntry> {
    await mkdir(await this.paths.destination(directory, name));
    return this.entry(childPath(directory, name));
  }

  /** The stream is bounded by actual bytes, including requests without a length header. */
  async upload(relative: string, body: ReadableStream<Uint8Array> | null, signal?: AbortSignal): Promise<FileEntry> {
    if (signal) requireActive(signal);
    const segments = validatePath(relative);
    if (!segments.length) throw new FileError("INVALID_PATH", "A file name is required.");
    const name = segments.at(-1)!;
    const directory = parentPath(relative);
    await this.paths.destination(directory, name);
    await mkdir(this.transferRoot, { recursive: true });
    const staging = await mkdtemp(path.join(this.transferRoot, "upload-"));
    const temporary = path.join(staging, "content");
    let bytes = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > MAX_FILE_BYTES ? new FileError("TOO_LARGE", "Files must be 100 MiB or smaller.", 413) : null, chunk);
      },
    });
    try {
      const source = body ? Readable.fromWeb(body as NodeReadableStream<Uint8Array>) : Readable.from([]);
      await pipeline(source, limit, createWriteStream(temporary, { flags: "wx" }), { signal });
      if (signal) requireActive(signal);
      const destination = await this.paths.destination(directory, name);
      // A hard link publishes the complete inode atomically and fails if another
      // request won the name. Rename would silently replace files on POSIX.
      // Staging and data must reside on the same filesystem.
      await link(temporary, destination);
      return await this.entry(relative);
    } finally {
      // Pipeline closes its streams before cleanup, including on client disconnect.
      await rm(staging, { recursive: true, force: true });
    }
  }

  /** Normalize line endings without trimming meaningful whitespace or rejecting empty files. */
  async createText(directory: string, name: string, content: string, signal?: AbortSignal): Promise<FileEntry> {
    await this.paths.destination(directory, name);
    const bytes = Buffer.from(content.replace(/\r\n?/g, "\n"), "utf8");
    if (bytes.length > MAX_FILE_BYTES) throw new FileError("TOO_LARGE", "Files must be 100 MiB or smaller.", 413);
    return this.upload(childPath(directory, name), new ReadableStream({ start(controller) {
      controller.enqueue(bytes);
      controller.close();
    } }), signal);
  }

  /** Delete a checked resource permanently, with an explicit non-deletable root. */
  async delete(relative: string): Promise<void> {
    if (!validatePath(relative).length) throw new FileError("ROOT_PROTECTED", "The data root cannot be deleted.", 403);
    const target = await this.paths.resolve(relative);
    const stat = await lstat(target);
    if (!stat.isFile() && !stat.isDirectory()) throw new FileError("UNSUPPORTED", "This resource type is not supported.");
    // Recursive rm removes nested links themselves rather than following them.
    await rm(target, { recursive: stat.isDirectory() });
  }
}
