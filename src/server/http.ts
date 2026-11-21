import { MAX_FILE_BYTES } from "../shared/files";
import { asFileError, FileError } from "./errors";

/** Route handlers return codes for consumers and avoid exposing local OS paths. */
export async function respond(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    const failure = asFileError(error);
    if (failure.status === 500) console.error("File operation failed.", error);
    return Response.json({ code: failure.code, message: failure.message }, {
      status: failure.status, headers: { "Cache-Control": "no-store" },
    });
  }
}

/** An internal app still must reject a different website submitting destructive requests. */
export function requireSameOrigin(request: Request): void {
  const internalUrl = new URL(request.url);
  // Next may construct request.url with its bind hostname. Host describes the
  // browser-facing authority; a reverse proxy must preserve that original host.
  const publicOrigin = new URL(`${internalUrl.protocol}//${request.headers.get("host") ?? internalUrl.host}`).origin;
  if (request.headers.get("origin") !== publicOrigin) {
    throw new FileError("ORIGIN_REJECTED", "A same-origin request is required.", 403);
  }
}

/** Bounded streaming parsing prevents an untrusted Content-Length from bypassing limits. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new FileError("INVALID_BODY", "An application/json request is required.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new FileError("INVALID_BODY", "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_FILE_BYTES + 64 * 1024) {
        await reader.cancel();
        throw new FileError("TOO_LARGE", "The request body is too large.", 413);
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new FileError("INVALID_BODY", "A JSON object is required.");
  }
}

export function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new FileError("INVALID_BODY", `The ${key} field must be a string.`);
  return value;
}

/** Dynamic route parameters arrive decoded from Next.js and are joined only once. */
export type ResourceContext = { params: Promise<{ path: string[] }> };
export type ArchiveContext = { params: Promise<{ path?: string[] }> };
