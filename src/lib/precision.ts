export type PrecisionTier = "good" | "usable" | "weak" | "unusable";

export interface Precision {
  tier: PrecisionTier;
  label: string;
  description: string;
  color: string;
}

export function scorePrecision(accuracyMeters: number | null | undefined, ageMs: number): Precision {
  if (accuracyMeters == null || !isFinite(accuracyMeters)) {
    return { tier: "unusable", label: "Unusable", description: "No accuracy reported", color: "var(--bad)" };
  }
  if (ageMs > 60_000) {
    return { tier: "unusable", label: "Stale", description: `Fix is ${Math.round(ageMs / 1000)}s old`, color: "var(--bad)" };
  }
  if (accuracyMeters > 500) {
    return { tier: "unusable", label: "Unusable", description: "Likely IP-based fallback", color: "var(--bad)" };
  }
  if (accuracyMeters > 100) {
    return { tier: "weak", label: "Weak", description: "Too coarse for turn-by-turn", color: "var(--warn)" };
  }
  if (accuracyMeters > 30) {
    return { tier: "usable", label: "Usable", description: "OK for coarse routing", color: "var(--warn)" };
  }
  return { tier: "good", label: "Good", description: "Navigation-grade fix", color: "var(--good)" };
}

export function formatCoord(n: number): string {
  return n.toFixed(6);
}