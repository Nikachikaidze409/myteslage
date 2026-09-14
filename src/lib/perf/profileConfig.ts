// Central configuration for runtime map-rendering capability detection.
//
// Every threshold and every per-profile rendering setting lives here so no
// component carries an unexplained magic number. Nothing in this module knows
// anything about the vehicle, the CPU or the GPU: only what the browser can
// actually do right now.

export type PerfProfile = "HIGH" | "STANDARD" | "LEGACY";

export interface ProfileSettings {
  /** Google Maps rendering type requested explicitly at map creation. */
  rendering: "vector" | "raster";
  /** Whether a tilted (3D) navigation camera may be used at all. */
  allowTilt: boolean;
  /** Basemap label / POI density. */
  labelDensity: "full" | "reduced" | "minimal";
  /** Google's own POI icons clickable (costs extra interaction work). */
  clickableIcons: boolean;
  /** Minimum gap between camera writes: 33ms ~ 30fps, 100ms ~ 10fps. */
  cameraMinIntervalMs: number;
  /** Car marker icon is only redrawn past this screen-rotation change. */
  markerRotationThresholdDeg: number;
  /** Car marker is only repositioned past this coordinate change (degrees). */
  markerMoveThresholdDeg: number;
  /** Whether the visible Google traffic overlay may be switched on by the user. */
  trafficToggleAvailable: boolean;
}

/**
 * The visible traffic overlay is OFF by default in every profile; only HIGH
 * exposes the toggle. Traffic-aware route CALCULATION is unaffected by all of
 * this and stays enabled everywhere.
 */
export const PROFILES: Record<PerfProfile, ProfileSettings> = {
  HIGH: {
    rendering: "vector",
    allowTilt: true,
    labelDensity: "full",
    clickableIcons: true,
    cameraMinIntervalMs: 33,
    markerRotationThresholdDeg: 1.5,
    markerMoveThresholdDeg: 2e-6,
    trafficToggleAvailable: true,
  },
  STANDARD: {
    rendering: "vector",
    allowTilt: false,
    labelDensity: "reduced",
    clickableIcons: true,
    cameraMinIntervalMs: 100,
    markerRotationThresholdDeg: 3,
    markerMoveThresholdDeg: 4e-6,
    trafficToggleAvailable: false,
  },
  LEGACY: {
    rendering: "raster",
    allowTilt: false,
    labelDensity: "minimal",
    clickableIcons: false,
    cameraMinIntervalMs: 165,
    markerRotationThresholdDeg: 5,
    markerMoveThresholdDeg: 8e-6,
    trafficToggleAvailable: false,
  },
};

export const PERF_THRESHOLDS = {
  /** Length of one passive animation-frame sample window. */
  sampleWindowMs: 1500,
  /** Frames shorter than this on average count as smooth (~50fps). */
  highAvgFrameMs: 20,
  /** Above this average the device is struggling (~22fps). */
  poorAvgFrameMs: 45,
  /** A single frame longer than this counts as a dropped/long frame. */
  longFrameMs: 60,
  /** HIGH tolerates at most this many long frames in one window. */
  highMaxLongFrames: 1,
  /** Map creation slower than this rules out HIGH. */
  highMaxInitMs: 2500,
  /** HIGH needs at least this many logical cores when the browser reports them. */
  highMinCores: 4,
  /** HIGH needs at least this much device memory (GB) when reported. */
  highMinMemoryGb: 4,
  /** Consecutive poor windows required before dropping to raster. */
  poorWindowsForLegacy: 2,
} as const;

/** Bump the version to invalidate every persisted profile after a config change. */
export const PROFILE_STORAGE_KEY = "tsl.map-profile.v1";

/** Where detection always starts before anything has been measured. */
export const DEFAULT_PROFILE: PerfProfile = "STANDARD";

const ORDER: PerfProfile[] = ["HIGH", "STANDARD", "LEGACY"];

/** true when `b` is a weaker profile than `a`. */
export function isDowngrade(a: PerfProfile, b: PerfProfile): boolean {
  return ORDER.indexOf(b) > ORDER.indexOf(a);
}

export function settingsFor(profile: PerfProfile): ProfileSettings {
  return PROFILES[profile];
}
