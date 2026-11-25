import { Readable } from "node:stream";

/** Attach cancellation only after the web adapter and Response own the stream.
 * Passing an already-aborted signal into createReadStream can destroy it before
 * Readable.toWeb installs error listeners, leaving a disturbed response body and
 * an unhandled AbortError. Source streams passed here must not bind that signal.
 */
export function streamResponse(source: Readable, init: ResponseInit, signal: AbortSignal): Response {
  const body = Readable.toWeb(source) as ReadableStream<Uint8Array>;
  const response = new Response(body, init);
  const stop = () => { source.destroy(); };
  signal.addEventListener("abort", stop, { once: true });
  source.once("close", () => signal.removeEventListener("abort", stop));
  // Cover cancellation between the last awaited filesystem call and registration.
  if (signal.aborted) stop();
  return response;
}
