import path from "node:path";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { FileError } from "./errors";

/** Reject ambiguous Windows names as well as traversal on every host OS. */
export function validateName(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || value === "." || value === ".." ||
    /[\x00-\x1f\x7f<>:"/\\|?*]/u.test(value) || /[. ]$/u.test(value) ||
    /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/iu.test(value) ||
    Buffer.byteLength(value, "utf8") > 255) {
    throw new FileError("INVALID_NAME", "Use a valid single file or directory name.");
  }
}

/** No URL decoding here: Next.js has already decoded route parameters once. */
export function validatePath(value: string): string[] {
  if (typeof value !== "string") throw new FileError("INVALID_PATH", "Invalid resource path.");
  if (value === "") return [];
  const segments = value.split("/");
  for (const segment of segments) validateName(segment);
  return segments;
}

/** Centralized root boundary checks are shared by browsing, writes and transfers. */
export class DataPaths {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    // A linked data root would make the configured boundary misleading.
    if ((await lstat(this.root)).isSymbolicLink()) throw new FileError("UNSUPPORTED", "The data root cannot be a link.");
  }

  /** Resolve each existing component without following symlinks or junctions. */
  async resolve(relative: string): Promise<string> {
    const segments = validatePath(relative);
    await this.initialize();
    const canonicalRoot = await realpath(this.root);
    let target = this.root;
    for (const segment of segments) {
      target = path.join(target, segment);
      if ((await lstat(target)).isSymbolicLink()) throw new FileError("UNSUPPORTED", "Links are not supported.");
      const canonical = await realpath(target);
      const inside = path.relative(canonicalRoot, canonical);
      if (inside === ".." || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
        throw new FileError("INVALID_PATH", "The resource must stay inside data.");
      }
    }
    return target;
  }

  async directory(relative: string): Promise<string> {
    const target = await this.resolve(relative);
    if (!(await lstat(target)).isDirectory()) throw new FileError("NOT_DIRECTORY", "The resource is not a directory.");
    return target;
  }

  async destination(directory: string, name: string): Promise<string> {
    validateName(name);
    return path.join(await this.directory(directory), name);
  }
}
