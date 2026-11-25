import { isIPv4 } from "node:net";
import type { LanCandidate } from "../../shared/network";

/** Windows configuration joined by interface index, before eligibility checks. */
export interface NetworkAddress {
  interfaceIndex: number;
  interfaceType: number;
  physical: boolean;
  up: boolean;
  address: string;
  preferred: boolean;
  skipAsSource: boolean;
  manual: boolean;
  defaultRouteMetric: number | null;
  networkName: string | null;
}

function privateIPv4(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [first, second] = address.split(".").map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

/** Exclude unusable networks before applying the user's preference for manual IPs. */
export function selectLanCandidates(addresses: readonly NetworkAddress[]): LanCandidate[] {
  return addresses.filter(address =>
    address.physical && address.up && [6, 71].includes(address.interfaceType) &&
    address.preferred && !address.skipAsSource && privateIPv4(address.address)
  ).sort((left, right) =>
    Number(right.manual) - Number(left.manual) ||
    Number(left.defaultRouteMetric === null) - Number(right.defaultRouteMetric === null) ||
    (left.defaultRouteMetric ?? 0) - (right.defaultRouteMetric ?? 0) ||
    left.interfaceIndex - right.interfaceIndex ||
    compareIPv4(left.address, right.address)
  ).map(address => ({
    id: String(address.interfaceIndex) + ":" + address.address,
    address: address.address,
    networkName: address.networkName,
  }));
}

function compareIPv4(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 4; index++) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}
