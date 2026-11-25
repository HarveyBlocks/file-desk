import { files } from "@/server/instance";
import { respond } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return respond(async () => Response.json({ entries: await files.list(new URL(request.url).searchParams.get("path") ?? "") },
    { headers: { "Cache-Control": "no-store" } }));
}
