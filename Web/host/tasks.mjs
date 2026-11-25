import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/** Track requests through response completion and asynchronous handler cleanup. */
export class TaskRegistry {
  #tasks = new Map();
  #context = new AsyncLocalStorage();
  stopping = false;

  snapshot() {
    return Array.from(this.#tasks.values(), ({ controller, pendingSources, streaming, onSettled, ...task }) => ({ ...task }));
  }

  current() { return this.#context.getStore(); }

  run(task, operation) { return this.#context.run(task, operation); }

  begin(operation, resource) {
    if (this.stopping) return null;
    const task = {
      id: randomUUID(), operation, path: resource, phase: "Starting",
      completed: 0, total: null, unit: "bytes", controller: new AbortController(),
    };
    this.#tasks.set(task.id, task);
    return task;
  }

  finish(task) { this.#tasks.delete(task.id); }

  /** Check and transition synchronously, so no new task can enter between them. */
  requestExit(force = false) {
    if (this.#tasks.size && !force) return false;
    this.stopping = true;
    if (force) for (const task of this.#tasks.values()) task.controller.abort();
    return true;
  }
}


/** Attach byte accounting without putting an incoming request into flowing mode. */
export function observeRequest(request, response, task) {
  const originalEmit = request.emit;
  request.emit = function(event, ...args) {
    if (event === "data" && ["Upload", "Create text file", "Create folder"].includes(task.operation)) {
      task.completed += Buffer.byteLength(args[0]);
      task.phase = "Receiving";
    }
    return originalEmit.call(this, event, ...args);
  };
  const incomingLength = Number(request.headers["content-length"]);
  if (["Upload", "Create text file", "Create folder"].includes(task.operation) &&
      Number.isSafeInteger(incomingLength) && incomingLength >= 0 && request.headers["content-length"] !== undefined) {
    task.total = incomingLength;
  }
  let declaredResponseLength;
  const originalWriteHead = response.writeHead;
  if (originalWriteHead) response.writeHead = function(status, ...args) {
    const headers = args.at(-1);
    if (headers && typeof headers === "object") {
      const pairs = Array.isArray(headers)
        ? Array.from({ length: headers.length / 2 }, (_, index) => [headers[index * 2], headers[index * 2 + 1]])
        : Object.entries(headers);
      declaredResponseLength = pairs.find(([name]) => String(name).toLowerCase() === "content-length")?.[1];
    }
    return originalWriteHead.call(this, status, ...args);
  };
  const count = chunk => {
    if (chunk != null && ["Download", "Preview", "ZIP"].includes(task.operation)) {
      task.completed += Buffer.byteLength(chunk);
      task.phase = "Sending";
      // Next may pass headers directly to writeHead, which does not populate
      // getHeader(). Capture that public response API as well as setHeader().
      const declared = response.getHeader("content-length") ?? declaredResponseLength;
      const total = Number(declared);
      if (declared !== undefined && Number.isSafeInteger(total) && total >= 0) task.total = total;
    }
  };
  const originalWrite = response.write;
  response.write = function(chunk, ...args) { count(chunk); return originalWrite.call(this, chunk, ...args); };
  const originalEnd = response.end;
  response.end = function(chunk, ...args) {
    if (typeof chunk !== "function") count(chunk);
    return originalEnd.call(this, chunk, ...args);
  };
}

export function describeRequest(request) {
  const url = new URL(request.url, "http://localhost");
  let resource;
  try { resource = decodeURIComponent(url.pathname.replace(/^\/api\/(files|archives|entries)\/?/, "")); }
  catch { resource = url.pathname; }
  if (request.method === "PUT" && url.pathname.startsWith("/api/files/")) return ["Upload", resource];
  if (request.method === "GET" && url.pathname.startsWith("/api/files/")) return [url.searchParams.get("disposition") === "inline" ? "Preview" : "Download", resource];
  if (request.method === "GET" && /^\/api\/archives(?:\/|$)/.test(url.pathname)) return ["ZIP", resource || "data"];
  if (request.method === "DELETE" && url.pathname.startsWith("/api/entries/")) return ["Delete", resource];
  if (request.method === "POST" && url.pathname === "/api/text-files") return ["Create text file", ""];
  if (request.method === "POST" && url.pathname === "/api/directories") return ["Create folder", ""];
  return ["Read", url.pathname];
}
