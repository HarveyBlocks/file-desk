import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import { FileStore } from "../src/server/storage";
import { FileError, asFileError } from "../src/server/errors";
import { validateName, validatePath } from "../src/server/paths";
import { byteRange, contentDisposition, downloadFile } from "../src/server/download";
import { downloadArchive } from "../src/server/archive";
import { previewFile } from "../src/server/preview";
import { readJson, requireSameOrigin, respond } from "../src/server/http";
import { MAX_FILE_BYTES, MAX_PREVIEW_BYTES, resourceUrl } from "../src/shared/files";
import { pageResourcePath } from "../src/server/pagePath";
import { modifiedTime } from "../src/shared/format";

/** Every test owns an OS temporary tree, with no references to the real data directory. */
async function fixture(run: (store: FileStore, base: string) => Promise<void>) {
  const base = await mkdtemp(path.join(tmpdir(), "files-test-"));
  try { await run(new FileStore(path.join(base, "data"), path.join(base, "transfers")), base); }
  finally { await rm(base, { recursive: true, force: true }); }
}

function body(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

test("page path decoding preserves literal percent syntax and rejects encoded separators", () => {
  assert.equal(pageResourcePath(["Project%20%23%20100%25", "%E6%96%87%E6%A1%A3.txt"]), "Project # 100%/文档.txt");
  assert.equal(pageResourcePath(["literal%252F.txt"]), "literal%2F.txt");
  assert.throws(() => pageResourcePath(["a%2Fb"]), FileError);
  assert.throws(() => pageResourcePath(["%2e%2e"]), FileError);
});

test("display dates use UTC+8 without a timezone label, including day and year boundaries", () => {
  assert.equal(modifiedTime("2026-11-21T14:33:00.000Z"), "2026-11-21 22:33");
  assert.equal(modifiedTime("2026-12-31T16:00:00.000Z"), "2027-01-01 00:00");
});

test("directory listing, empty content, LF conversion, download and recursive deletion", () => fixture(async store => {
  assert.deepEqual(await store.list(""), []);
  await store.createDirectory("", "Folder");
  await store.createDirectory("Folder", "Empty");
  await store.createText("Folder", "notes.txt", "  first\r\nsecond\r\n  ");
  await store.createText("", "empty.txt", "");
  assert.deepEqual((await store.list("")).map(e => [e.name, e.type]), [["Folder", "directory"], ["empty.txt", "file"]]);
  const response = await downloadFile(store, "Folder/notes.txt", new Request("http://localhost/api/files/Folder/notes.txt"));
  assert.equal(await response.text(), "  first\nsecond\n  ");
  const empty = await downloadFile(store, "empty.txt", new Request("http://localhost/api/files/empty.txt"));
  assert.equal((await empty.arrayBuffer()).byteLength, 0);
  await store.delete("empty.txt");
  await store.delete("Folder");
  assert.deepEqual(await store.list(""), []);
}));

test("binary bytes and Unicode, spaces, percent, hash and URL syntax survive round trips", () => fixture(async store => {
  const name = "文档 # 100% & '().bin";
  const bytes = Uint8Array.from([0, 255, 13, 10, 42, 128]);
  await store.upload(name, body(bytes));
  const url = resourceUrl("/api/files", name);
  assert.equal(decodeURIComponent(url.slice("/api/files/".length)), name);
  const response = await downloadFile(store, name, new Request(`http://localhost${url}`));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.match(response.headers.get("content-disposition")!, /filename\*=UTF-8''/);
  assert.equal((await previewFile(store, name)).kind, "unsupported");
}));

test("conflicts never overwrite, including simultaneous publication", () => fixture(async store => {
  await store.createText("", "same.txt", "original");
  await assert.rejects(store.createText("", "same.txt", "replacement"), error => asFileError(error).code === "CONFLICT");
  assert.equal(await readFile(path.join(store.paths.root, "same.txt"), "utf8"), "original");
  const writes = await Promise.allSettled([store.createText("", "race.txt", "a"), store.createText("", "race.txt", "b")]);
  assert.equal(writes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(asFileError((writes.find(result => result.status === "rejected") as PromiseRejectedResult).reason).code, "CONFLICT");
  await assert.rejects(store.createDirectory("", "same.txt"), error => asFileError(error).code === "CONFLICT");
}));

test("invalid names, traversal, absolute paths and root deletion are rejected", () => fixture(async store => {
  for (const name of ["", ".", "..", "a/b", "a\\b", "C:", "x\0y", "x.", "x ", "CON", "nul.txt", "bad\nname", "a?b"]) {
    assert.throws(() => validateName(name), FileError);
  }
  for (const relative of ["../secret", "/tmp/file", "a//b", "a/../b", "C:\\Windows\\file"]) assert.throws(() => validatePath(relative), FileError);
  await assert.rejects(store.delete(""), error => asFileError(error).code === "ROOT_PROTECTED");
  await assert.rejects(store.createText("missing", "file", "x"), error => asFileError(error).code === "NOT_FOUND");
  await assert.rejects(store.entry("missing"), error => asFileError(error).status === 404);
}));

test("links are listed as unsupported and never followed, including by ZIP", () => fixture(async (store, base) => {
  const outside = path.join(base, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "secret.txt"), "secret");
  await store.list("");
  await symlink(outside, path.join(store.paths.root, "outside-link"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await store.list(""))[0].type, "unsupported");
  await assert.rejects(store.list("outside-link"), error => asFileError(error).code === "UNSUPPORTED");
  await assert.rejects(store.entry("outside-link/secret.txt"), error => asFileError(error).code === "UNSUPPORTED");
  await assert.rejects(downloadArchive(store, "", new Request("http://localhost/zip")), error => asFileError(error).code === "UNSUPPORTED");
  assert.equal(await readFile(path.join(outside, "secret.txt"), "utf8"), "secret");
}));

test("deleting a directory containing a link leaves its target untouched", () => fixture(async (store, base) => {
  const outside = path.join(base, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "keep.txt"), "keep");
  await store.createDirectory("", "nested");
  await symlink(outside, path.join(store.paths.root, "nested", "link"), process.platform === "win32" ? "junction" : "dir");
  await store.delete("nested");
  assert.equal(await readFile(path.join(outside, "keep.txt"), "utf8"), "keep");
}));

test("ZIP preserves hierarchy, hidden files, empty folders and original bytes", () => fixture(async store => {
  await store.createDirectory("", "项目 #");
  await store.createDirectory("项目 #", "empty");
  await store.createText("项目 #", ".hidden", "hidden");
  const bytes = Uint8Array.from([0, 255, 12]);
  await store.upload("项目 #/raw.bin", body(bytes));
  const archive = await downloadArchive(store, "项目 #", new Request("http://localhost/zip"));
  const entries = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  assert.ok("项目 #/empty/" in entries);
  assert.equal(new TextDecoder().decode(entries["项目 #/.hidden"]), "hidden");
  assert.deepEqual(entries["项目 #/raw.bin"], bytes);
  const root = await downloadArchive(store, "", new Request("http://localhost/zip"));
  assert.ok("data/项目 #/empty/" in unzipSync(new Uint8Array(await root.arrayBuffer())));
}));

test("byte ranges support suffix and open-ended forms, rejecting invalid ranges", () => fixture(async store => {
  await store.createText("", "range.txt", "0123456789");
  for (const [range, expected] of [["bytes=2-5", "2345"], ["bytes=8-", "89"], ["bytes=-3", "789"], ["bytes=7-99", "789"]]) {
    const response = await downloadFile(store, "range.txt", new Request("http://localhost/file", { headers: { Range: range } }));
    assert.equal(response.status, 206);
    assert.equal(await response.text(), expected);
    assert.equal(Number(response.headers.get("content-length")), expected.length);
  }
  for (const range of ["bytes=20-", "bytes=5-2", "bytes=-0", "bytes=0-1,4-5", "bytes=-", "items=1-2"]) {
    assert.equal(byteRange(range, 10), null);
    const response = await downloadFile(store, "range.txt", new Request("http://localhost/file", { headers: { Range: range } }));
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */10");
    await response.text();
  }
}));

test("text preview is bounded, escaped as data and rejects invalid UTF-8", () => fixture(async store => {
  await store.createText("", "page.html", '<script>alert("x")</script>');
  const preview = await previewFile(store, "page.html");
  assert.equal(preview.kind, "text");
  const response = await downloadFile(store, "page.html", new Request("http://localhost/file?disposition=inline"));
  assert.match(response.headers.get("content-type")!, /^text\/plain/);
  assert.match(response.headers.get("content-security-policy")!, /sandbox/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  await response.text();
  await store.upload("bad.bin", body(Uint8Array.from([0xff, 0xfe])));
  const binary = await downloadFile(store, "bad.bin", new Request("http://localhost/file?disposition=inline"));
  assert.match(binary.headers.get("content-disposition")!, /^attachment/);
  await binary.arrayBuffer();
  await store.createText("", "large.txt", "a".repeat(MAX_PREVIEW_BYTES - 1) + "文" + "b");
  const large = await previewFile(store, "large.txt");
  assert.equal(large.kind, "text");
  if (large.kind === "text") { assert.equal(large.truncated, true); assert.equal(large.text.length, MAX_PREVIEW_BYTES - 1); }
}));

test("SVG and JavaScript are text; raster images, PDF and media use passive types", () => fixture(async store => {
  for (const name of ["vector.svg", "script.js", "README.md"]) {
    await store.createText("", name, "<svg onload='alert(1)'></svg>");
    assert.equal((await previewFile(store, name)).kind, "text");
  }
  for (const [name, kind] of [["a.png", "image"], ["a.pdf", "pdf"], ["a.mp3", "audio"], ["a.mp4", "video"]]) {
    await store.upload(name, body(new Uint8Array()));
    assert.equal((await previewFile(store, name)).kind, kind);
  }
}));

test("uploads enforce actual byte limits and remove partial temporary files", () => fixture(async (store, base) => {
  let sent = 0;
  const chunk = Buffer.alloc(1024 * 1024);
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    controller.enqueue(chunk); sent += chunk.length;
    if (sent > MAX_FILE_BYTES) controller.close();
  } });
  await assert.rejects(store.upload("large.bin", stream), error => asFileError(error).code === "TOO_LARGE");
  assert.deepEqual(await store.list(""), []);
  assert.deepEqual(await readdir(path.join(base, "transfers")), []);
}));

test("aborted uploads never publish and clean staging", () => fixture(async (store, base) => {
  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    controller.enqueue(Buffer.alloc(32));
    abort.abort();
  } });
  await assert.rejects(store.upload("aborted.bin", stream, abort.signal));
  assert.deepEqual(await store.list(""), []);
  assert.deepEqual(await readdir(path.join(base, "transfers")), []);
}));

test("cancelled file and ZIP downloads release descriptors", () => fixture(async store => {
  await store.upload("large.bin", body(Buffer.alloc(2 * 1024 * 1024)));
  const file = await downloadFile(store, "large.bin", new Request("http://localhost/file"));
  const reader = file.body!.getReader();
  await reader.read(); await reader.cancel();
  const archive = await downloadArchive(store, "", new Request("http://localhost/zip"));
  const zipReader = archive.body!.getReader();
  await zipReader.read(); await zipReader.cancel();
  // Windows refuses deletion while an unclosed descriptor is still in use.
  await store.delete("large.bin");
}));

test("already cancelled downloads do not create a disturbed Response or unhandled stream errors", () => fixture(async store => {
  await store.createText("", "cancel.txt", "content");
  const abort = new AbortController();
  abort.abort();
  const request = new Request("http://localhost/file", { signal: abort.signal });
  await assert.rejects(downloadFile(store, "cancel.txt", request), error => asFileError(error).code === "CANCELLED");
  await assert.rejects(downloadArchive(store, "", request), error => asFileError(error).code === "CANCELLED");
  await store.delete("cancel.txt");
}));

test("request cancellation while transfers are active closes both file and ZIP sources", () => fixture(async store => {
  await store.upload("active.bin", body(Buffer.alloc(4 * 1024 * 1024)));
  for (const archive of [false, true]) {
    const abort = new AbortController();
    const request = new Request("http://localhost/file", { signal: abort.signal });
    const response = archive ? await downloadArchive(store, "", request) : await downloadFile(store, "active.bin", request);
    const reader = response.body!.getReader();
    await reader.read();
    abort.abort();
    // The consumer observes closure or an adapter cancellation error, never an unhandled process error.
    try { while (!(await reader.read()).done) { /* Drain pending adapter output. */ } } catch { /* Cancellation is expected. */ }
    reader.releaseLock();
  }
  await store.delete("active.bin");
}));

test("same-origin mutations, JSON validation and structured error responses", async () => {
  for (const origin of [null, "http://evil.test"]) {
    assert.throws(() => requireSameOrigin(new Request("http://localhost/api/files/a", { headers: origin ? { Origin: origin } : {} })), FileError);
  }
  requireSameOrigin(new Request("http://localhost/api/files/a", { headers: { Origin: "http://localhost" } }));
  requireSameOrigin(new Request("http://0.0.0.0:13453/api/files/a", { headers: { Host: "files.internal:13453", Origin: "http://files.internal:13453" } }));
  const request = (body: string, type = "application/json") => new Request("http://localhost/api/text-files", { method: "POST", headers: { "Content-Type": type }, body });
  assert.deepEqual(await readJson(request('{"name":"file"}')), { name: "file" });
  for (const content of ["null", "[]", "{"]) await assert.rejects(readJson(request(content)), FileError);
  await assert.rejects(readJson(request("{}", "text/plain")), FileError);
  const response = await respond(async () => { throw new FileError("CONFLICT", "Already exists.", 409); });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "CONFLICT", message: "Already exists." });
  assert.doesNotMatch(contentDisposition("文档.txt"), /\r|\n/);
});
