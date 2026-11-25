import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import net from "node:net";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { readMessages, sendMessage } from "../host/protocol.mjs";

test("desktop host identity, live tasks, cancellation, root isolation and idle exit", { timeout: 90000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), "filedesk-host-"));
  const pipeName = process.platform === "win32" ? "\\\\.\\pipe\\FileDesk-test-" + randomUUID() : path.join(root, "control.sock");
  const messages = [];
  let peer;
  const control = net.createServer(socket => {
    peer = socket;
    readMessages(socket, message => {
      messages.push(message);
      if (message.type === "hello") sendMessage(socket, { type: "welcome" });
    }, error => { throw error; });
  });
  control.listen(pipeName);
  await once(control, "listening");
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const child = spawn(process.execPath, [path.resolve("host/server.mjs")], {
    cwd: tmpdir(), windowsHide: true,
    env: { ...process.env, FILEDESK_ROOT: root, FILEDESK_PIPE: pipeName, FILEDESK_TOKEN: "test-token", PORT: String(port), HOSTNAME: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", bytes => { logs += bytes; });
  child.stderr.on("data", bytes => { logs += bytes; });
  const exited = once(child, "exit");
  const until = async predicate => {
    for (let index = 0; index < 500; index++) {
      if (predicate()) return;
      if (child.exitCode !== null) throw new Error("Host exited. " + logs);
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error("Timed out waiting for host. " + logs + JSON.stringify(messages.slice(-5)));
  };
  const origin = "http://127.0.0.1:" + port;
  let upload;
  let download;
  try {
    await until(() => messages.some(message => message.state === "running"));
    assert.equal(messages.find(message => message.type === "hello").token, "test-token");
    const listing = await fetch(origin + "/api/entries");
    assert.equal(listing.status, 200, (await listing.text()) + logs);
    await t.test("real custom host creates content only in explicit root", async () => {
      const response = await fetch(origin + "/api/text-files", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ directory: "", name: "notes.txt", content: "host bytes" }) });
      assert.equal(response.status, 201);
      assert.equal(await (await fetch(origin + "/api/files/notes.txt")).text(), "host bytes");
      const range = await fetch(origin + "/api/files/notes.txt", { headers: { Range: "bytes=1-3" } });
      assert.equal(range.status, 206);
      assert.equal(await range.text(), "ost");
      const zip = await fetch(origin + "/api/archives");
      assert.equal(zip.status, 200);
      await zip.arrayBuffer();
    });
    await t.test("slow uploads produce live progress and a busy exit decision", async () => {
      upload = http.request(origin + "/api/files/slow.bin", { method: "PUT", headers: { Origin: origin } });
      upload.on("error", () => {});
      upload.write(Buffer.alloc(32768));
      await until(() => messages.some(message => message.tasks?.some(task => task.operation === "Upload" && task.completed >= 32768)));
      const task = messages.flatMap(message => message.tasks ?? []).find(task => task.operation === "Upload" && task.completed >= 32768);
      assert.equal(task.total, null);
      const before = messages.length;
      sendMessage(peer, { type: "exit" });
      await until(() => messages.slice(before).some(message => message.type === "busy"));
      const listing = await fetch(origin + "/api/entries");
    assert.equal(listing.status, 200, (await listing.text()) + logs);
      upload.destroy();
      await until(() => messages.at(-1)?.tasks?.every(task => task.operation !== "Upload"));
      assert.deepEqual(await readdir(path.join(root, "temp", "transfers")), []);
      assert.equal((await fetch(origin + "/api/files/slow.bin")).status, 404);
    });
    await t.test("download tasks stay active while the response is backpressured", async () => {
      await writeFile(path.join(root, "data", "large.bin"), Buffer.alloc(48 * 1024 * 1024, 42));
      download = await new Promise(resolve => {
        http.get(origin + "/api/files/large.bin", response => { response.pause(); resolve(response); });
      });
      await until(() => messages.some(message => message.tasks?.some(task => task.operation === "Download" && task.total === 48 * 1024 * 1024)));
      download.destroy();
      await until(() => messages.at(-1)?.tasks?.every(task => task.operation !== "Download"));
    });
    await t.test("ZIP cancellation retains unknown progress and closes lazy file sources", async () => {
      await writeFile(path.join(root, "data", "archive.bin"), randomBytes(16 * 1024 * 1024));
      const before = messages.length;
      download = await new Promise(resolve => {
        http.get(origin + "/api/archives", response => { response.pause(); resolve(response); });
      });
      await until(() => messages.slice(before).some(message => message.tasks?.some(task => task.operation === "ZIP" && task.completed > 0)));
      const task = messages.slice(before).flatMap(message => message.tasks ?? []).find(task => task.operation === "ZIP" && task.completed > 0);
      assert.equal(task.total, null);
      const decision = messages.length;
      sendMessage(peer, { type: "exit" });
      await until(() => messages.slice(decision).some(message => message.type === "busy"));
      download.destroy();
      await until(() => messages.at(-1)?.tasks?.every(task => task.operation !== "ZIP"));
      await rm(path.join(root, "data", "archive.bin"));
    });
    await t.test("forced stop cancels incomplete upload and cleans staging before exit", async () => {
      upload = http.request(origin + "/api/files/cancel.bin", { method: "PUT", headers: { Origin: origin } });
      upload.on("error", () => {});
      upload.write(Buffer.alloc(65536));
      const before = messages.length;
      await until(() => messages.slice(before).some(message => message.tasks?.some(task => task.operation === "Upload")));
      sendMessage(peer, { type: "terminate" });
      const [code] = await exited;
      assert.equal(code, 0, logs);
      assert.deepEqual(await readdir(path.join(root, "temp", "transfers")), []);
      assert.equal((await readdir(path.join(root, "data"))).includes("cancel.bin"), false);
    });
    assert.doesNotMatch(logs, /uncaughtException|disturbed or locked|Request failed/);
  } finally {
    upload?.destroy();
    download?.destroy();
    if (child.exitCode === null) { child.kill(); await exited; }
    peer?.destroy();
    await new Promise(resolve => control.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
