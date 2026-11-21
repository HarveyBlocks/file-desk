import { files } from "@/server/instance";
import { downloadFile } from "@/server/download";
import { requireSameOrigin, respond, type ResourceContext } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, context: ResourceContext) {
  return respond(async () => downloadFile(files, (await context.params).path.join("/"), request));
}

export function PUT(request: Request, context: ResourceContext) {
  return respond(async () => {
    requireSameOrigin(request);
    const entry = await files.upload((await context.params).path.join("/"), request.body, request.signal);
    return Response.json({ entry }, { status: 201 });
  });
}
