"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, FileQuestion } from "lucide-react";

export default function NotFound() {
  const pathname = usePathname();
  const parent = pathname.startsWith("/files/") ? pathname.slice(0, pathname.lastIndexOf("/")) || "/files" : "/files";
  return <main className="workspace"><div className="empty-state missing-state"><FileQuestion size={36} strokeWidth={1.3} /><h1>Resource not found</h1><Link className="text-link" href={parent}><ArrowLeft size={16} />Back to folder</Link></div></main>;
}
