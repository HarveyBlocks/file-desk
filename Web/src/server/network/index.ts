import type { LanCandidate } from "../../shared/network";
import { selectLanCandidates, type NetworkAddress } from "./selection";
import { queryWindowsNetwork } from "./windows";

/**
 * Discover fresh server addresses. Unsupported hosts and failed probes yield an
 * empty list so network metadata can never make the file browser unavailable.
 */
export async function readLanCandidates(
  probe: () => Promise<NetworkAddress[]> = queryWindowsNetwork,
  platform: string = process.platform,
): Promise<LanCandidate[]> {
  if (platform !== "win32") return [];
  try {
    return selectLanCandidates(await probe());
  } catch {
    return [];
  }
}
