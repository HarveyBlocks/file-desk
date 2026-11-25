import path from "node:path";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { MAX_PREVIEW_BYTES } from "../shared/files";
import { FileError } from "./errors";
import type { FileStore } from "./storage";

export type Preview =
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "image" | "pdf" | "audio" | "video" | "unsupported" };

const passiveTypes: Record<string, { kind: "image" | "pdf" | "audio" | "video"; mime: string }> = {
  ".png": { kind: "image", mime: "image/png" }, ".jpg": { kind: "image", mime: "image/jpeg" },
  ".jpeg": { kind: "image", mime: "image/jpeg" }, ".gif": { kind: "image", mime: "image/gif" },
  ".webp": { kind: "image", mime: "image/webp" }, ".avif": { kind: "image", mime: "image/avif" },
  ".bmp": { kind: "image", mime: "image/bmp" }, ".pdf": { kind: "pdf", mime: "application/pdf" },
  ".mp3": { kind: "audio", mime: "audio/mpeg" }, ".wav": { kind: "audio", mime: "audio/wav" },
  ".ogg": { kind: "audio", mime: "audio/ogg" }, ".m4a": { kind: "audio", mime: "audio/mp4" },
  ".mp4": { kind: "video", mime: "video/mp4" }, ".webm": { kind: "video", mime: "video/webm" },
};

/** Only passive browser formats may receive a non-text inline content type. */
export function passiveType(relative: string) {
  return passiveTypes[path.extname(relative).toLowerCase()];
}

/** Open checked regular files; NOFOLLOW also closes the final-component link race on POSIX. */
export async function openFile(store: FileStore, relative: string): Promise<FileHandle> {
  const target = await store.paths.resolve(relative);
  const file = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  if (!(await file.stat()).isFile()) {
    await file.close();
    throw new FileError("NOT_FILE", "The resource is not a regular file.");
  }
  return file;
}

/** Decode only a bounded prefix. Fatal UTF-8 decoding prevents binary garbage previews. */
export async function previewFile(store: FileStore, relative: string): Promise<Preview> {
  const passive = passiveType(relative);
  if (passive) return { kind: passive.kind };
  const file = await openFile(store, relative);
  try {
    const stat = await file.stat();
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_PREVIEW_BYTES));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const truncated = stat.size > bytesRead;
    try {
      // Streaming decode allows a valid multi-byte character cut by the preview limit.
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead), { stream: truncated });
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text)) return { kind: "unsupported" };
      return { kind: "text", text, truncated };
    } catch {
      return { kind: "unsupported" };
    }
  } finally {
    await file.close();
  }
}
