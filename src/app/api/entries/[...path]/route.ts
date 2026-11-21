import { files } from "@/server/instance";
import { requireSameOrigin, respond, type ResourceContext } from "@/server/http";

export const runtime = "nodejs";

export function DELETE(request: Request, context: ResourceContext) {
  return respond(async () => {
    requireSameOrigin(request);
    await files.delete((await context.params).path.join("/"));
    return new Response(null, { status: 204 });
  });
}
