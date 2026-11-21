import Link from "next/link";
import { ChevronRight, HardDrive } from "lucide-react";
import { resourceUrl } from "@/shared/files";

/** Breadcrumb links use the same segment encoding as resource and download URLs. */
export function Breadcrumbs({ path }: { path: string }) {
  const segments = path ? path.split("/") : [];
  return <nav className="breadcrumbs" aria-label="Breadcrumb">
    <Link href="/files" className="root-link" title="Data root" aria-label="Data root"><HardDrive size={19} /><span>Files</span></Link>
    {segments.map((segment, index) => <span className="crumb" key={index}>
      <ChevronRight size={14} aria-hidden="true" />
      {index === segments.length - 1 ? <span aria-current="page">{segment}</span> :
        <Link href={resourceUrl("/files", segments.slice(0, index + 1).join("/"))}>{segment}</Link>}
    </span>)}
  </nav>;
}
