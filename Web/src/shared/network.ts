/** A qualified server address, ordered by the server's recommendation policy. */
export interface LanCandidate {
  /** Stable within an adapter so equal addresses on separate networks stay distinct. */
  id: string;
  address: string;
  networkName: string | null;
}
