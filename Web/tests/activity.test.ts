import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FileStore } from "../src/server/storage";
import { FileError } from "../src/server/errors";

test("desktop cancellation stops recursive deletion between entries and preserves completed changes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "filedesk-delete-"));
  const key = Symbol.for("FileDesk.activity");
  const runtime = globalThis as unknown as Record<symbol, unknown>;
  const previous = runtime[key];
  const controller = new AbortController();
  let completed = 0;
  const task = {
    controller,
    get completed() { return completed; },
    set completed(value: number) { completed = value; if (value > 0) controller.abort(); },
  };
  try {
    const store = new FileStore(path.join(root, "data"), path.join(root, "transfers"));
    await mkdir(path.join(root, "data", "folder"), { recursive: true });
    await Promise.all(["a.txt", "b.txt", "c.txt"].map(name => writeFile(path.join(root, "data", "folder", name), name)));
    runtime[key] = { current: () => task };
    await assert.rejects(store.delete("folder"), FileError);
    assert.equal(completed, 1);
    assert.deepEqual(await readdir(path.join(root, "data", "folder")), ["b.txt", "c.txt"]);
  } finally {
    if (previous === undefined) delete runtime[key];
    else runtime[key] = previous;
    await rm(root, { recursive: true, force: true });
  }
});
