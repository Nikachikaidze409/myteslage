// Runtime map-rendering capability detector.
//
// Silent by design: it never renders UI, never talks to a server, never calls
// a Google API and never measures anything beyond frames the browser already
// produced. All state lives in this controller (refs, not React state).

import { FrameSampler, type FrameSample } from "./frameSampler";
import { allowTransition, classifyPreInit, classifyRuntime } from "./profileClassifier";
import {
  DEFAULT_PROFILE,
  PERF_THRESHOLDS,
  PROFILE_STORAGE_KEY,
  type PerfProfile,
} from "./profileConfig";
import { probeWebgl, readHardwareHints, type WebglSupport } from "./webglProbe";

export interface PerfDiagnostics {
  profile: PerfProfile;
  reasons: string[];
  webgl: "webgl2" | "webgl1" | "none";
  renderingType: "vector" | "raster" | "unknown";
  mapInitMs: number | null;
  avgFrameMs: number | null;
  estimatedFps: number | null;
  longFrames: number;
  contextLossEvents: number;
  fellBack: boolean;
  persisted: PerfProfile | null;
  cores: number | null;
  memoryGb: number | null;
  reducedMotion: boolean;
}

function readPersisted(): PerfProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    return v === "HIGH" || v === "STANDARD" || v === "LEGACY" ? v : null;
  } catch {
    return null;
  }
}

function writePersisted(p: PerfProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, p);
  } catch {
    /* storage disabled */
  }
}

/** Developer-only: clear the stored profile so detection runs again. */
export function clearPersistedProfile(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    /* storage disabled */
  }
}

export class PerformanceProfileDetector {
  private profile: PerfProfile = DEFAULT_PROFILE;
  private readonly webgl: WebglSupport;
  private readonly hints = readHardwareHints();
  private readonly persisted = readPersisted();
  private reasons: string[] = [];
  private sampler = new FrameSampler();
  private cancelSample: (() => void) | null = null;
  private timer: number | null = null;
  private poorWindows = 0;
  private downgraded = false;
  private stopped = false;
  private mapInitMs: number | null = null;
  private lastSample: FrameSample | null = null;
  private contextLossEvents = 0;
  private renderingType: "vector" | "raster" | "unknown" = "unknown";

  onProfileChange: ((p: PerfProfile) => void) | null = null;
  onDiagnostics: ((d: PerfDiagnostics) => void) | null = null;

  constructor() {
    this.webgl = probeWebgl();
    const verdict = classifyPreInit({
      webgl2: this.webgl.webgl2,
      webgl1: this.webgl.webgl1,
      persisted: this.persisted,
    });
    this.profile = verdict.profile;
    this.reasons = verdict.reasons;
    if (this.profile === "LEGACY") this.downgraded = true;
  }

  current(): PerfProfile {
    return this.profile;
  }

  /** Called once the map exists, with how long creating it took. */
  mapInitialized(ms: number, renderingType: "vector" | "raster"): void {
    this.mapInitMs = ms;
    this.renderingType = renderingType;
    this.emit();
    this.scheduleSample(400);
  }

  /** The map could not be created at all. */
  rendererFailed(): void {
    this.apply(
      classifyRuntime(this.runtimeInput({ rendererFailed: true, contextLost: false })),
    );
  }

  /** The WebGL context backing the map was lost. */
  contextLost(): void {
    this.contextLossEvents++;
    this.apply(classifyRuntime(this.runtimeInput({ rendererFailed: false, contextLost: true })));
  }

  private scheduleSample(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (this.stopped) return;
      this.cancelSample = this.sampler.sample(PERF_THRESHOLDS.sampleWindowMs, (s) => {
        this.cancelSample = null;
        this.lastSample = s;
        if (s.avgFrameMs > PERF_THRESHOLDS.poorAvgFrameMs) this.poorWindows++;
        else this.poorWindows = 0;
        this.apply(classifyRuntime(this.runtimeInput({ rendererFailed: false, contextLost: false })));
        // Keep watching only while a downgrade is still possible.
        if (!this.stopped && !this.downgraded) this.scheduleSample(4000);
      });
    }, delayMs);
  }

  private runtimeInput(flags: { rendererFailed: boolean; contextLost: boolean }) {
    return {
      current: this.profile,
      webgl2: this.webgl.webgl2,
      avgFrameMs: this.lastSample?.avgFrameMs ?? 0,
      longFrames: this.lastSample?.longFrames ?? 0,
      mapInitMs: this.mapInitMs,
      cores: this.hints.cores,
      memoryGb: this.hints.memoryGb,
      reducedMotion: this.hints.reducedMotion,
      poorWindows: this.poorWindows,
      alreadyDowngraded: this.downgraded,
      ...flags,
    };
  }

  private apply(v: ReturnType<typeof classifyRuntime>): void {
    this.reasons = v.reasons;
    if (v.persist !== this.profile) writePersisted(v.persist);
    if (v.applied !== this.profile && allowTransition(this.profile, v.applied)) {
      this.profile = v.applied;
      this.downgraded = true;
      writePersisted(v.applied);
      this.onProfileChange?.(v.applied);
    }
    this.emit();
  }

  private emit(): void {
    this.onDiagnostics?.(this.diagnostics());
  }

  diagnostics(): PerfDiagnostics {
    const avg = this.lastSample?.avgFrameMs ?? null;
    return {
      profile: this.profile,
      reasons: this.reasons,
      webgl: this.webgl.webgl2 ? "webgl2" : this.webgl.webgl1 ? "webgl1" : "none",
      renderingType: this.renderingType,
      mapInitMs: this.mapInitMs,
      avgFrameMs: avg,
      estimatedFps: avg && avg > 0 ? 1000 / avg : null,
      longFrames: this.lastSample?.longFrames ?? 0,
      contextLossEvents: this.contextLossEvents,
      fellBack: this.downgraded,
      persisted: readPersisted(),
      cores: this.hints.cores,
      memoryGb: this.hints.memoryGb,
      reducedMotion: this.hints.reducedMotion,
    };
  }

  stop(): void {
    this.stopped = true;
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
    this.cancelSample?.();
    this.cancelSample = null;
    this.sampler.stop();
    this.onProfileChange = null;
    this.onDiagnostics = null;
  }
}
