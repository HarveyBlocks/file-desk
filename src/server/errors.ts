/** Expected failures cross the HTTP boundary using a stable code and status. */
export class FileError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

/** Reject cancellation before allocating descriptors or publishing a resource. */
export function requireActive(signal: AbortSignal): void {
  if (signal.aborted) throw new FileError("CANCELLED", "The request was cancelled.", 499);
}

/** Inspect OS error codes, never platform-dependent error messages. */
export function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export function asFileError(error: unknown): FileError {
  if (error instanceof FileError) return error;
  if (hasCode(error, "ABORT_ERR")) return new FileError("CANCELLED", "The request was cancelled.", 499);
  if (hasCode(error, "ENOENT")) return new FileError("NOT_FOUND", "Resource not found.", 404);
  if (hasCode(error, "EEXIST")) return new FileError("CONFLICT", "A resource with this name already exists.", 409);
  if (hasCode(error, "ENOTDIR")) return new FileError("NOT_DIRECTORY", "The parent is not a directory.", 400);
  if (hasCode(error, "EACCES") || hasCode(error, "EPERM")) return new FileError("FORBIDDEN", "Access denied.", 403);
  if (hasCode(error, "ENOSPC")) return new FileError("STORAGE_FULL", "Storage is full.", 507);
  if (hasCode(error, "EXDEV") || hasCode(error, "ENOTSUP")) return new FileError("STORAGE_CONFIGURATION", "Data and transfer staging must support hard links on the same filesystem.", 500);
  return new FileError("INTERNAL_ERROR", "The operation could not be completed.", 500);
}
