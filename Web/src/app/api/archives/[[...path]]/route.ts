import { files } from "@/server/instance";
import { downloadArchive } from "@/server/archive";
import { respond, type ArchiveContext } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, context: ArchiveContext) {
  return respond(async () => downloadArchive(files, (await context.params).path?.join("/") ?? "", request));
}

/** Validate archive metadata without allocating a ZIP stream. */
export const HEAD = GET;
