import path from "node:path";

/** Storage paths share an explicit root; standalone CLI use starts from Web. */
if (process.env.FILEDESK_ROOT && !path.isAbsolute(process.env.FILEDESK_ROOT)) {
  throw new TypeError("FILEDESK_ROOT must be absolute.");
}

export const PROJECT_ROOT = path.resolve(process.env.FILEDESK_ROOT ?? path.join(process.cwd(), ".."));
export const DATA_ROOT = path.join(PROJECT_ROOT, "data");
// A sibling staging directory keeps unfinished uploads out of the managed tree.
export const TRANSFER_ROOT = path.join(PROJECT_ROOT, "temp", "transfers");
