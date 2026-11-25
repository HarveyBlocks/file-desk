import path from "node:path";

/** All filesystem paths derive from the directory used to start the application. */
export const PROJECT_ROOT = process.cwd();
export const DATA_ROOT = path.join(PROJECT_ROOT, "data");
// A sibling staging directory keeps unfinished uploads out of the managed tree.
export const TRANSFER_ROOT = path.join(PROJECT_ROOT, "temp", "transfers");
