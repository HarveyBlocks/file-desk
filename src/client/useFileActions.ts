"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { childPath, MAX_FILE_BYTES, resourceUrl, type FileEntry } from "@/shared/files";
import { failureMessage, jsonRequest, mutate } from "./api";

/** A single in-flight action keeps directory refreshes and confirmation dialogs coherent. */
export function useFileActions(directory: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function perform(operation: (signal: AbortSignal) => Promise<void>, success: string): Promise<boolean> {
    if (controller.current) return false;
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setNotice(null);
    try {
      await operation(current.signal);
      setNotice({ error: false, text: success });
      router.refresh();
      return true;
    } catch (error) {
      if (!current.signal.aborted) setNotice({ error: true, text: failureMessage(error) });
      return false;
    } finally {
      controller.current = null;
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setNotice({ error: true, text: "Files must be 100 MiB or smaller." });
      return;
    }
    await perform(signal => mutate(resourceUrl("/api/files", childPath(directory, file.name)), {
      method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file, signal,
    }), "File uploaded.");
  }

  function create(kind: "text" | "directory", name: string, content: string) {
    return perform(signal => mutate(kind === "text" ? "/api/text-files" : "/api/directories", {
      ...jsonRequest({ directory, name, ...(kind === "text" ? { content } : {}) }), signal,
    }), kind === "text" ? "File created." : "Folder created.");
  }

  function remove(entry: FileEntry) {
    return perform(signal => mutate(resourceUrl("/api/entries", entry.path), { method: "DELETE", signal }), "Deleted.");
  }

  return { busy, notice, upload, create, remove, clearNotice: () => setNotice(null) };
}
