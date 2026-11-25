import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { TaskRegistry, observeRequest, describeRequest } from "../host/tasks.mjs";
import { readMessages } from "../host/protocol.mjs";

test("idle exit transitions atomically and refuses new tasks", () => {
  const registry = new TaskRegistry();
  assert.equal(registry.requestExit(), true);
  assert.equal(registry.begin("Upload", "new.bin"), null);
});

test("busy exit keeps running; forced exit aborts every active operation", () => {
  const registry = new TaskRegistry();
  const first = registry.begin("Upload", "file.bin");
  assert.equal(registry.requestExit(), false);
  const second = registry.begin("Delete", "folder");
  assert.equal(registry.stopping, false);
  assert.equal(registry.requestExit(true), true);
  assert.equal(first.controller.signal.aborted, true);
  assert.equal(second.controller.signal.aborted, true);
  registry.finish(first);
  registry.finish(first);
  registry.finish(second);
  assert.equal(registry.snapshot().length, 0);
});

test("snapshots expose structured progress and unknown totals", () => {
  const registry = new TaskRegistry();
  const task = registry.begin("ZIP", "folder");
  const snapshot = registry.snapshot();
  assert.equal(snapshot[0].total, null);
  assert.equal("controller" in snapshot[0], false);
  task.completed = 20;
  assert.equal(snapshot[0].completed, 0, "snapshots must not alias live records");
});

test("incoming byte accounting does not consume a request prematurely", () => {
  const registry = new TaskRegistry();
  const request = new PassThrough();
  request.headers = {};
  const response = new EventEmitter();
  response.write = () => true;
  response.end = () => {};
  const task = registry.begin("Upload", "file.bin");
  observeRequest(request, response, task);
  assert.notEqual(request.readableFlowing, true);
  request.write(Buffer.from("bytes"));
  assert.equal(task.completed, 0);
  const chunk = request.read();
  assert.equal(chunk.toString(), "bytes");
  assert.equal(task.completed, 5);
  assert.equal(task.total, null);
});

test("response accounting covers write/end and Range response length", () => {
  const registry = new TaskRegistry();
  const request = new EventEmitter();
  request.headers = {};
  const response = { write: () => true, end: () => {}, getHeader: () => "3", hasHeader: () => true };
  const task = registry.begin("Download", "file.bin");
  observeRequest(request, response, task);
  response.write(Buffer.from("ab"));
  response.end("c");
  assert.equal(task.completed, 3);
  assert.equal(task.total, 3);
});

test("operation metadata retains encoded resources and distinguishes previews", () => {
  assert.deepEqual(describeRequest({ method: "PUT", url: "/api/files/a%20b.bin" }), ["Upload", "a b.bin"]);
  assert.deepEqual(describeRequest({ method: "GET", url: "/api/files/a.pdf?disposition=inline" }), ["Preview", "a.pdf"]);
  assert.deepEqual(describeRequest({ method: "GET", url: "/api/archives" }), ["ZIP", "data"]);
});

test("control frames handle split/coalesced messages and reject invalid protocol", () => {
  const socket = new PassThrough();
  const received = [];
  const errors = [];
  readMessages(socket, message => received.push(message.type), error => errors.push(error));
  socket.write('{"version":1,"type":"snap');
  socket.write('shot"}\n{"version":1,"type":"exit"}\n');
  assert.deepEqual(received, ["snapshot", "exit"]);
  socket.write('{"version":2,"type":"exit"}\n');
  assert.equal(errors.length, 1);
});

test("control frames reject oversized unterminated messages", () => {
  const socket = new PassThrough();
  const errors = [];
  readMessages(socket, () => assert.fail("Invalid frame accepted"), error => errors.push(error));
  socket.write("a".repeat(65537));
  assert.equal(errors.length, 1);
});
