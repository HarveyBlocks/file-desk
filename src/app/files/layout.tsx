import type { ReactNode } from "react";
import { NetworkAddress } from "@/components/NetworkAddress";
import { readLanCandidates } from "@/server/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shared layouts survive resource navigation, preserving the user's display choice. */
export default async function FilesLayout({ children }: { children: ReactNode }) {
  const candidates = await readLanCandidates();
  return <><NetworkAddress candidates={candidates} />{children}</>;
}
