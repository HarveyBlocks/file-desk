import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { unzipSync } from "fflate";
import { resourceUrl } from "../src/shared/files";
import { randomBytes } from "node:crypto";

/** Run next start from an isolated build copy, never the user's data directory. */
test("production HTTP lifecycle and cancellation", { timeout: 120000 }, async t => {
  const fixture = await mkdtemp(path.join(tmpdir(), "files-production-"));
  const source = path.resolve(".next");
  await cp(source, path.join(fixture, ".next"), { recursive: true, filter: candidate => {
    const relative = path.relative(source, candidate).split(path.sep);
    return !["cache", "dev", "standalone"].includes(relative[0]);
  } });
  await cp(path.resolve("package.json"), path.join(fixture, "package.json"));
  await cp(path.resolve("next.config.ts"), path.join(fixture, "next.config.ts"));
  // Dependencies are shared read-only; removing this owned fixture removes only
  // the junction, never the dependency tree it points to.
  await symlink(path.resolve("node_modules"), path.join(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", fixture, "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: fixture, windowsHide: true, env: { ...process.env, FILEDESK_ROOT: fixture, PORT: String(port), HOSTNAME: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", chunk => { logs += String(chunk); });
  server.stderr.on("data", chunk => { logs += String(chunk); });
  const exit = once(server, "exit");
  const request = (url: string, init?: RequestInit) => fetch(origin + url, init);
  const post = (url: string, body: object) => request(url, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const upload = (relative: string, bytes: Uint8Array) => request(resourceUrl("/api/files", relative), {
    method: "PUT", headers: { Origin: origin }, body: Buffer.from(bytes),
  });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if ((await request("/api/entries")).ok) break; } catch { /* Wait only for this owned server. */ }
      if (attempt > 100 || server.exitCode !== null) throw new Error(`Production server did not start.\n${logs}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const directory = "Project # 100% 文档";
    await t.test("root redirect, nested navigation and encoded page versus API params", async () => {
      const redirect = await request("/", { redirect: "manual" });
      assert.equal(redirect.status, 307);
      assert.equal(redirect.headers.get("location"), "/files");
      assert.equal((await post("/api/directories", { directory: "", name: directory })).status, 201);
      assert.equal((await post("/api/directories", { directory, name: "empty" })).status, 201);
      assert.equal((await post("/api/text-files", { directory, name: "notes # %.txt", content: "  Hello\r\n<script>window.x=1</script>\n" })).status, 201);
      for (const relative of [directory, `${directory}/empty`, `${directory}/notes # %.txt`]) {
        const page = await request(resourceUrl("/files", relative));
        assert.equal(page.status, 200, await page.text());
      }
      const preview = await request(resourceUrl("/files", `${directory}/notes # %.txt`));
      assert.match(await preview.text(), /&lt;script&gt;/);
      assert.equal((await request("/api/entries?path=" + encodeURIComponent(directory))).status, 200);
      assert.equal((await request("/files/missing")).status, 404);
    });
    await t.test("literal encoded names are decoded exactly once", async () => {
      assert.equal((await post("/api/text-files", { directory, name: "literal%2F.txt", content: "literal" })).status, 201);
      assert.equal((await request(resourceUrl("/files", `${directory}/literal%2F.txt`))).status, 200);
      assert.equal(await (await request(resourceUrl("/api/files", `${directory}/literal%2F.txt`))).text(), "literal");
    });
    await t.test("binary upload/download, empty file, Range and HEAD", async () => {
      const bytes = Uint8Array.from([0, 255, 13, 10, 128]);
      assert.equal((await upload(`${directory}/raw.bin`, bytes)).status, 201);
      const response = await request(resourceUrl("/api/files", `${directory}/raw.bin`));
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
      const range = await request(resourceUrl("/api/files", `${directory}/raw.bin`), { headers: { Range: "bytes=1-2" } });
      assert.equal(range.status, 206);
      assert.deepEqual(new Uint8Array(await range.arrayBuffer()), bytes.slice(1, 3));
      assert.equal((await request(resourceUrl("/api/files", `${directory}/raw.bin`), { method: "HEAD" })).status, 200);
      assert.equal((await upload(`${directory}/empty.txt`, new Uint8Array())).status, 201);
      assert.equal((await (await request(resourceUrl("/api/files", `${directory}/empty.txt`))).arrayBuffer()).byteLength, 0);
    });
    await t.test("same-origin writes, conflicts and dangerous types remain safe", async () => {
      const conflict = await post("/api/text-files", { directory, name: "notes # %.txt", content: "replacement" });
      assert.equal(conflict.status, 409);
      assert.equal((await conflict.json()).code, "CONFLICT");
      assert.equal((await request("/api/directories", { method: "POST", headers: { Origin: "http://evil.test", "Content-Type": "application/json" }, body: JSON.stringify({ directory: "", name: "evil" }) })).status, 403);
      assert.equal((await post("/api/text-files", { directory, name: "../escape", content: "x" })).status, 400);
      const inline = await request(resourceUrl("/api/files", `${directory}/notes # %.txt`) + "?disposition=inline");
      assert.match(inline.headers.get("content-type")!, /text\/plain/);
      assert.match(inline.headers.get("content-security-policy")!, /sandbox/);
      assert.match(await inline.text(), /<script>/);
    });
    await t.test("ZIP bytes and empty hierarchy survive the actual HTTP stream", async () => {
      const head = await request(resourceUrl("/api/archives", directory), { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.match(head.headers.get("content-type")!, /application\/zip/);
      assert.equal((await head.arrayBuffer()).byteLength, 0);
      const response = await request(resourceUrl("/api/archives", directory));
      assert.equal(response.status, 200);
      const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
      assert.ok(`${directory}/empty/` in archive);
      assert.deepEqual(archive[`${directory}/raw.bin`], Uint8Array.from([0, 255, 13, 10, 128]));
    });
    await t.test("repeated mid-response cancellation does not crash Next.js", async () => {
      assert.equal((await upload(`${directory}/large.bin`, randomBytes(8 * 1024 * 1024))).status, 201);
      for (let index = 0; index < 12; index++) {
        const abort = new AbortController();
        const endpoint = index % 2 ? resourceUrl("/api/archives", directory) : resourceUrl("/api/files", `${directory}/large.bin`);
        const response = await request(endpoint, { signal: abort.signal });
        const reader = response.body!.getReader();
        await reader.read();
        abort.abort();
        await reader.cancel().catch(() => undefined);
      }
      assert.equal((await request("/api/entries")).status, 200);
      assert.doesNotMatch(logs, /uncaughtException|disturbed or locked|File operation failed/);
    });
    await t.test("recursive deletion and disappeared resources", async () => {
      const deleted = await request(resourceUrl("/api/entries", directory), { method: "DELETE", headers: { Origin: origin } });
      assert.equal(deleted.status, 204);
      const missing = await request(resourceUrl("/api/files", `${directory}/raw.bin`));
      assert.equal(missing.status, 404);
      assert.equal((await missing.json()).code, "NOT_FOUND");
      assert.deepEqual((await (await request("/api/entries")).json()).entries, []);
      assert.doesNotMatch(logs, /uncaughtException|disturbed or locked|File operation failed/);
    });
  } finally {
    server.kill();
    await exit;
    await rm(fixture, { recursive: true, force: true });
  }
});
