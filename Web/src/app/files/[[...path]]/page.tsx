import { notFound } from "next/navigation";
import { files } from "@/server/instance";
import { asFileError } from "@/server/errors";
import { previewFile } from "@/server/preview";
import { FileBrowser } from "@/components/FileBrowser";
import { FilePreview } from "@/components/FilePreview";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { pageResourcePath } from "@/server/pagePath";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Server rendering always reflects the running host, including out-of-band file changes. */
export default async function ResourcePage({ params }: { params: Promise<{ path?: string[] }> }) {
  const segments = (await params).path;
  let relative = "";
  try {
    relative = pageResourcePath(segments);
    const entry = await files.entry(relative);
    if (entry.type === "directory") return <FileBrowser key={relative} path={relative} entries={await files.list(relative)} />;
    return <FilePreview entry={entry} preview={entry.type === "file" ? await previewFile(files, relative) : { kind: "unsupported" }} />;
  } catch (error) {
    const failure = asFileError(error);
    if (failure.status === 404) notFound();
    if (failure.status === 500) console.error("Resource page failed.", error);
    return <main className="workspace"><header className="toolbar"><Breadcrumbs path={relative} /></header><p className="page-error" role="alert">{failure.message}</p></main>;
  }
}
