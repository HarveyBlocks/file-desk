"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Download, File, FilePlus2, Folder, FolderArchive, FolderPlus, LoaderCircle, Trash2, Upload, Ban } from "lucide-react";
import { resourceUrl, type FileEntry } from "@/shared/files";
import { modifiedTime } from "@/shared/format";
import { useFileActions } from "@/client/useFileActions";
import { Breadcrumbs } from "./Breadcrumbs";
import { IconButton } from "./IconButton";
import { CreateDialog, DeleteDialog } from "./FileDialogs";

export function fileSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** unit).toFixed(1)} ${["B", "KiB", "MiB", "GiB"][unit]}`;
}

/** The server owns directory snapshots; mutations request a fresh uncached render. */
export function FileBrowser({ path, entries }: { path: string; entries: FileEntry[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState<"text" | "directory" | null>(null);
  const [deleting, setDeleting] = useState<FileEntry | null>(null);
  const { busy, notice, upload, create, remove, clearNotice } = useFileActions(path);
  const openCreate = (kind: "text" | "directory") => { clearNotice(); setCreating(kind); };
  const openDelete = (entry: FileEntry) => { clearNotice(); setDeleting(entry); };
  // Mutation failures appear inside the active dialog, keeping correction in context.
  const error = notice?.error ? notice.text : undefined;

  return <main className="workspace" aria-busy={busy}>
    <header className="toolbar">
      <Breadcrumbs path={path} />
      <div className="toolbar-actions" aria-label="File actions">
        <input className="visually-hidden" ref={input} type="file" tabIndex={-1} aria-label="Choose a file" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file);
        }} />
        <IconButton label="Upload file" disabled={busy} onClick={() => input.current?.click()}><Upload size={18} /></IconButton>
        <IconButton label="New text file" disabled={busy} onClick={() => openCreate("text")}><FilePlus2 size={18} /></IconButton>
        <IconButton label="New folder" disabled={busy} onClick={() => openCreate("directory")}><FolderPlus size={18} /></IconButton>
        <a className="icon-button" title="Download folder as ZIP" aria-label="Download folder as ZIP" href={resourceUrl("/api/archives", path)}><FolderArchive size={18} /></a>
      </div>
    </header>

    <div className="status-line" aria-live="polite">
      {busy ? <span className="muted"><LoaderCircle size={14} className="spin" /> Working…</span> :
        notice && !creating && !deleting ? <span className={notice.error ? "error-message" : "muted"} role={notice.error ? "alert" : "status"}>{notice.text}</span> : <span className="muted">{entries.length} {entries.length === 1 ? "item" : "items"}</span>}
    </div>

    <section className="file-panel" aria-label="Directory contents">
      {entries.length === 0 ? <div className="empty-state"><Folder size={32} strokeWidth={1.3} /><p>This folder is empty.</p></div> :
        <table className="file-table"><thead><tr><th>Name</th><th className="size-column">Size</th><th className="date-column">Modified</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>{entries.map(entry => <tr key={entry.path}>
            <td>{entry.type === "unsupported" ? <span className="entry-name muted"><Ban size={18} />{entry.name}<span className="type-tag">Unsupported</span></span> :
              <Link className="entry-name" href={resourceUrl("/files", entry.path)}>{entry.type === "directory" ? <Folder size={19} /> : <File size={18} />}<span>{entry.name}</span></Link>}</td>
            <td className="size-column muted">{fileSize(entry.size)}</td>
            <td className="date-column muted"><time dateTime={entry.modifiedAt}>{modifiedTime(entry.modifiedAt)}</time></td>
            <td><div className="row-actions">{entry.type !== "unsupported" && <>
              <a className="icon-button" title={entry.type === "directory" ? `Download ${entry.name} as ZIP` : `Download ${entry.name}`} aria-label={entry.type === "directory" ? `Download ${entry.name} as ZIP` : `Download ${entry.name}`} href={resourceUrl(entry.type === "directory" ? "/api/archives" : "/api/files", entry.path)}><Download size={16} /></a>
              <IconButton label={`Delete ${entry.name}`} className="delete-action" disabled={busy} onClick={() => openDelete(entry)}><Trash2 size={16} /></IconButton>
            </>}</div></td>
          </tr>)}</tbody>
        </table>}
    </section>

    {creating && <CreateDialog kind={creating} busy={busy} error={error} onClose={() => setCreating(null)} onCreate={create} />}
    {deleting && <DeleteDialog entry={deleting} busy={busy} error={error} onClose={() => setDeleting(null)} onDelete={remove} />}
  </main>;
}
