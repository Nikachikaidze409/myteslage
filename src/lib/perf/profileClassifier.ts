// Pure profile classification. No DOM, no timers, no side effects - this is
// the unit-testable core of the capability detection.

import { DEFAULT_PROFILE, PERF_THRESHOLDS, isDowngrade, type PerfProfile } from "./profileConfig";

export interface PreInitInput {
  webgl2: boolean;
  webgl1: boolean;
  /** Profile stored by an earlier session, if it is still valid. */
  persisted: PerfProfile | null;
}

export interface Verdict {
  profile: PerfProfile;
  reasons: string[];
}

/**
 * Decided before the map is created, so the right rendering type can be
 * requested up front instead of being switched later.
 */
export function classifyPreInit(input: PreInitInput): Verdict {
  const reasons: string[] = [];
  if (!input.webgl1 && !input.webgl2) {
    reasons.push("no WebGL context available");
    return { profile: "LEGACY", reasons };
  }
  reasons.push(input.webgl2 ? "WebGL2 available" : "WebGL1 only");
  if (input.persisted) {
    reasons.push(`persisted profile ${input.persisted}`);
    // A persisted HIGH still needs a vector-capable context.
    if (input.persisted === "HIGH" && !input.webgl2) {
      reasons.push("persisted HIGH ignored: no WebGL2");
      return { profile: DEFAULT_PROFILE, reasons };
    }
    return { profile: input.persisted, reasons };
  }
  reasons.push("first visit: safe default");
  return { profile: DEFAULT_PROFILE, reasons };
}

export interface RuntimeInput {
  current: PerfProfile;
  webgl2: boolean;
  avgFrameMs: number;
  longFrames: number;
  mapInitMs: number | null;
  cores: number | null;
  memoryGb: number | null;
  reducedMotion: boolean;
  /** How many consecutive poor windows have been measured, including this one. */
  poorWindows: number;
  rendererFailed: boolean;
  contextLost: boolean;
  /** True once this session already stepped down; no further downgrades. */
  alreadyDowngraded: boolean;
}

export interface RuntimeVerdict {
  /** Profile to apply right now (never an upgrade during a session). */
  applied: PerfProfile;
  /** Profile worth persisting for the next visit. */
  persist: PerfProfile;
  reasons: string[];
}

export function classifyRuntime(input: RuntimeInput): RuntimeVerdict {
  const reasons: string[] = [];
  const t = PERF_THRESHOLDS;

  // Hard failures go straight to raster, even if a step was already taken.
  if (input.rendererFailed || input.contextLost) {
    reasons.push(input.contextLost ? "WebGL context lost" : "renderer initialization failed");
    return { applied: "LEGACY", persist: "LEGACY", reasons };
  }

  const poor = input.avgFrameMs > t.poorAvgFrameMs;
  const smooth =
    input.avgFrameMs > 0 &&
    input.avgFrameMs <= t.highAvgFrameMs &&
    input.longFrames <= t.highMaxLongFrames;

  if (poor) {
    reasons.push(`slow frames: ${Math.round(input.avgFrameMs)}ms avg (window ${input.poorWindows})`);
    if (input.poorWindows >= t.poorWindowsForLegacy && !input.alreadyDowngraded) {
      reasons.push("sustained poor performance");
      return { applied: "LEGACY", persist: "LEGACY", reasons };
    }
    if (input.current === "HIGH" && !input.alreadyDowngraded) {
      reasons.push("reducing visual work first");
      return { applied: "STANDARD", persist: "STANDARD", reasons };
    }
    return { applied: input.current, persist: input.current, reasons };
  }

  const highEligible =
    smooth &&
    input.webgl2 &&
    !input.reducedMotion &&
    (input.mapInitMs == null || input.mapInitMs <= t.highMaxInitMs) &&
    (input.cores == null || input.cores >= t.highMinCores) &&
    (input.memoryGb == null || input.memoryGb >= t.highMinMemoryGb) &&
    !input.alreadyDowngraded;

  if (highEligible && input.current !== "HIGH") {
    // Never upgraded live: persisted so the next visit starts on HIGH.
    reasons.push("stable frames: HIGH persisted for the next session");
    return { applied: input.current, persist: "HIGH", reasons };
  }

  reasons.push(`frames ok: ${Math.round(input.avgFrameMs)}ms avg`);
  return { applied: input.current, persist: input.current, reasons };
}

/** Guard used by the controller so a profile can only ever get weaker. */
export function allowTransition(from: PerfProfile, to: PerfProfile): boolean {
  return isDowngrade(from, to);
}
