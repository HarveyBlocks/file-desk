"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { FileEntry } from "@/shared/files";
import { IconButton } from "./IconButton";

/** Native modal dialogs supply focus trapping and Escape behavior without custom keyboard code. */
function Modal({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    element.querySelector("input")?.focus();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} className="modal" onCancel={event => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><IconButton label="Close" disabled={busy} onClick={onClose}><X size={18} /></IconButton></div>
    {children}
  </dialog>;
}

export function CreateDialog({ kind, busy, error, onClose, onCreate }: {
  kind: "text" | "directory"; busy: boolean; error?: string; onClose: () => void;
  onCreate: (kind: "text" | "directory", name: string, content: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  return <Modal title={kind === "text" ? "New text file" : "New folder"} busy={busy} onClose={onClose}>
    <form onSubmit={async event => { event.preventDefault(); if (await onCreate(kind, name, content)) onClose(); }}>
      <label htmlFor="resource-name">{kind === "text" ? "File name" : "Folder name"}</label>
      <input id="resource-name" autoFocus required autoComplete="off" disabled={busy} value={name} onChange={event => setName(event.target.value)} placeholder={kind === "text" ? "notes.txt" : "Folder name"} />
      {kind === "text" && <><label htmlFor="file-content">Content</label><textarea id="file-content" spellCheck={false} disabled={busy} value={content} onChange={event => setContent(event.target.value)} /></>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create"}</button></div>
    </form>
  </Modal>;
}

export function DeleteDialog({ entry, busy, error, onClose, onDelete }: {
  entry: FileEntry; busy: boolean; error?: string; onClose: () => void; onDelete: (entry: FileEntry) => Promise<boolean>;
}) {
  return <Modal title={entry.type === "directory" ? "Delete folder?" : "Delete file?"} busy={busy} onClose={onClose}>
    <p className="delete-path">{entry.path}</p>
    <p className="muted">{entry.type === "directory" ? "This permanently deletes this folder and every file and subfolder inside it." : "This permanently deletes this file."}</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button className="danger-button" disabled={busy} onClick={async () => { if (await onDelete(entry)) onClose(); }}>{busy ? "Deleting…" : "Delete permanently"}</button></div>
  </Modal>;
}
