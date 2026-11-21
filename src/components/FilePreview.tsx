import Link from "next/link";
import { ArrowLeft, Download, FileQuestion } from "lucide-react";
import { parentPath, resourceUrl, type FileEntry } from "@/shared/files";
import type { Preview } from "@/server/preview";
import { Breadcrumbs } from "./Breadcrumbs";

/** Text stays escaped by React; uploaded markup is never inserted into the document. */
export function FilePreview({ entry, preview }: { entry: FileEntry; preview: Preview }) {
  const source = resourceUrl("/api/files", entry.path) + "?disposition=inline";
  return <main className="workspace">
    <header className="toolbar"><Breadcrumbs path={entry.path} /><div className="toolbar-actions">
      <Link className="icon-button" title="Back to folder" aria-label="Back to folder" href={resourceUrl("/files", parentPath(entry.path))}><ArrowLeft size={18} /></Link>
      <a className="icon-button" title="Download file" aria-label="Download file" href={resourceUrl("/api/files", entry.path)}><Download size={18} /></a>
    </div></header>
    <section className={`preview-panel preview-${preview.kind}`} aria-label="File preview">
      {preview.kind === "text" && <>{preview.truncated && <p className="preview-notice">Preview limited to 1 MiB. Download the file for its full content.</p>}<pre className="text-preview">{preview.text || <span className="muted">Empty file</span>}</pre></>}
      {/* A native image element avoids optimizer transformations of managed file bytes. */}
      {preview.kind === "image" && <img className="image-preview" src={source} alt={entry.name} />}
      {/* Chrome's isolated native PDF viewer is a plugin and is blocked by iframe sandbox. */}
      {preview.kind === "pdf" && <iframe className="pdf-preview" src={source} title={entry.name} />}
      {preview.kind === "audio" && <audio controls preload="metadata" src={source}>Your browser does not support this audio format.</audio>}
      {preview.kind === "video" && <video controls preload="metadata" src={source}>Your browser does not support this video format.</video>}
      {preview.kind === "unsupported" && <div className="empty-state"><FileQuestion size={32} strokeWidth={1.3} /><p>Preview unavailable.</p><a className="text-link" href={resourceUrl("/api/files", entry.path)}>Download file</a></div>}
    </section>
  </main>;
}
