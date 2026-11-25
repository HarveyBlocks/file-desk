"use client";

import { useState } from "react";
import { Network } from "lucide-react";
import type { LanCandidate } from "@/shared/network";

/** Keep the display choice local. The shared layout preserves it during navigation. */
export function NetworkAddress({ candidates }: { candidates: readonly LanCandidate[] }) {
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? "");
  const selected = candidates.find(candidate => candidate.id === selectedId) ?? candidates[0];
  return <aside className="network-bar" aria-label="Server LAN address">
    <Network size={15} aria-hidden="true" />
    {!selected ? <span>LAN address unavailable</span> : candidates.length === 1 ?
      <span className="network-value">{label(selected)}</span> :
      <select className="network-select" aria-label="Server LAN address" title="Server LAN address"
        value={selected.id} onChange={event => setSelectedId(event.target.value)}>
        {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{label(candidate)}</option>)}
      </select>}
  </aside>;
}

function label(candidate: LanCandidate): string {
  return candidate.address + (candidate.networkName ? " · " + candidate.networkName : "");
}
