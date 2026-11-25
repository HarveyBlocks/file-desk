import { FileError } from "./errors";
import { validateName } from "./paths";

/** Next 16.4 page params retain URL encoding, unlike Route Handler params.
 * Decode each page segment exactly once, then validate it independently so an
 * encoded slash cannot introduce an extra filesystem component.
 */
export function pageResourcePath(segments: string[] = []): string {
  return segments.map(segment => {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); }
    catch { throw new FileError("INVALID_PATH", "Invalid resource path encoding."); }
    validateName(decoded);
    return decoded;
  }).join("/");
}
