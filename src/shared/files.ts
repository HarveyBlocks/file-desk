/** A resource path is relative to data and always uses forward slashes. */
export interface FileEntry {
  name: string;
  path: string;
  type: "directory" | "file" | "unsupported";
  /** Null for non-files: a directory inode size is not its recursive content size. */
  size: number | null;
  /** ISO timestamp for transport; the UI formats it in UTC+8. */
  modifiedAt: string;
}

/** Machine-readable failures are separate from text shown to the user. */
export interface ApiFailure {
  code: string;
  message: string;
}

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 1024 * 1024;

/** Encode segments independently so resource names cannot become URL syntax. */
export function resourceUrl(prefix: string, path = ""): string {
  return prefix + (path ? "/" + path.split("/").map(encodeURIComponent).join("/") : "");
}

export function parentPath(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

export function childPath(directory: string, name: string): string {
  return directory ? `${directory}/${name}` : name;
}
