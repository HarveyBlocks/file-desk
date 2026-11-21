import { files } from "@/server/instance";
import { readJson, requireSameOrigin, respond, stringField } from "@/server/http";

export const runtime = "nodejs";

export function POST(request: Request) {
  return respond(async () => {
    requireSameOrigin(request);
    const body = await readJson(request);
    const entry = await files.createText(stringField(body, "directory"), stringField(body, "name"), stringField(body, "content"), request.signal);
    return Response.json({ entry }, { status: 201 });
  });
}
