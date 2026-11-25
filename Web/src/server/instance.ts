import { DATA_ROOT, TRANSFER_ROOT } from "./config";
import { FileStore } from "./storage";

/** Only the runtime entrypoint binds file services to the production data tree. */
export const files = new FileStore(DATA_ROOT, TRANSFER_ROOT);
