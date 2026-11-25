import type { Readable } from "node:stream";
import { trackTaskSource } from "./activity";

/**
 * Bridge Node sources with an explicit terminal state. Cancellation can arrive
 * while an iterator read is pending, so every completion checks that state
 * before touching the Web controller. This avoids double-close races under
 * download backpressure while preserving immediate descriptor cleanup.
 */
export function streamResponse(source: Readable, init: ResponseInit, signal: AbortSignal): Response {
  trackTaskSource(source);
  const iterator = source[Symbol.asyncIterator]();
  let settled = false;
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const detach = () => signal.removeEventListener("abort", abort);
  const close = () => {
    if (settled) return;
    settled = true;
    detach();
    controller.close();
  };
  const abort = () => {
    close();
    source.destroy();
  };
  const onError = (error: Error) => {
    if (settled) return;
    settled = true;
    detach();
    controller.error(error);
  };
  const body = new ReadableStream<Uint8Array>({
    start(activeController) {
      controller = activeController;
      // Install an owner before an already-aborted request can destroy the source.
      source.on("error", onError);
      source.once("close", () => {
        detach();
        source.removeListener("error", onError);
      });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull() {
      if (settled) return;
      try {
        const chunk = await iterator.next();
        if (settled) return;
        if (chunk.done) close();
        else controller.enqueue(chunk.value);
      } catch (error) { onError(error as Error); }
    },
    async cancel() {
      settled = true;
      detach();
      source.destroy();
      try { await iterator.return?.(); } catch { /* The cancelled response already owns this failure. */ }
    },
  });
  return new Response(body, init);
}
