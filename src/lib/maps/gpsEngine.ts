// Raw GPS -> accuracy gate -> outlier rejection -> smoothing -> heading
// smoothing -> last-reliable-position retention.
//
// This runs outside React: it holds mutable state and is read by the
// animation loop. It never triggers a render on its own.

import { angleDelta, bearing, haversine, lerpAngle, type LatLng } from "./math";

export interface RawFix {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface GpsState {
  /** smoothed position (may be snapped to the route for rendering) */
  lat: number;
  /** smoothed heading in degrees, or null while stationary and unknown */
  lng: number;
  /**
   * Smoothed position that is NEVER snapped to a route. Decision logic must
   * use this: snapping the displayed car to the line and then measuring the
   * distance from that same line is a feedback loop that hides real
   * departures.
   */
  dLat: number;
  dLng: number;
  heading: number | null;
  /** metres per second */
  speed: number;
  accuracy: number;
  /** performance.now() of the last accepted fix */
  at: number;
  /** true when no usable fix arrived recently (tunnel, garage) */
  stale: boolean;
}


/** Beyond this a fix is meaningless even as a rough hint. */
const MAX_ACCURACY_M = 2000;
/** No road vehicle covers this much ground per second. */
const MAX_SPEED_MPS = 75;
/** After this long without a fix, the position is treated as stale. */
const STALE_AFTER_MS = 14000;

export type RejectReason =
  | "invalid-coordinate"
  | "accuracy-too-poor"
  | "impossible-jump"
  | "other";

export interface GpsEngineDiag {
  offered: number;
  accepted: number;
  rejected: number;
  lastReject: RejectReason | null;
}

export class GpsEngine {
  private accepted: RawFix | null = null;
  // Diagnostics counters only — they never influence acceptance.
  private nOffered = 0;
  private nAccepted = 0;
  private nRejected = 0;
  private lastReject: RejectReason | null = null;
  private smooth: LatLng | null = null;
  /** Same smoothing, but never overwritten by route snapping. */
  private decisionSmooth: LatLng | null = null;
  private headingSmooth: number | null = null;
  private speedSmooth = 0;
  private acceptedAt = 0;
  private rejects = 0;

  /** Feed a device / paired-phone fix. Returns false when it was rejected. */
  ingest(fix: RawFix, now = performance.now()): boolean {
    this.nOffered++;
    if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) return this.reject("invalid-coordinate");
    if (Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) return this.reject("invalid-coordinate");
    if (Number.isFinite(fix.accuracy) && fix.accuracy > MAX_ACCURACY_M) {
      return this.reject("accuracy-too-poor");
    }

    const prev = this.accepted;
    if (prev) {
      const dt = Math.max(0.2, (fix.timestamp - prev.timestamp) / 1000);
      const d = haversine(prev, fix);
      const implied = d / dt;
      // An impossible jump is rejected once; if the next fixes agree with it,
      // the device really did move (tunnel exit, GPS re-lock) so we accept.
      if (implied > MAX_SPEED_MPS && this.rejects < 2) {
        this.rejects++;
        return this.reject("impossible-jump");
      }
    }
    this.rejects = 0;
    this.nAccepted++;
    this.accepted = fix;
    this.acceptedAt = now;

    // Position smoothing: trust an accurate fix more than a vague one.
    const w = accuracyWeight(fix.accuracy);
    this.smooth = this.smooth
      ? {
          lat: this.smooth.lat + (fix.lat - this.smooth.lat) * w,
          lng: this.smooth.lng + (fix.lng - this.smooth.lng) * w,
        }
      : { lat: fix.lat, lng: fix.lng };
    this.decisionSmooth = this.decisionSmooth
      ? {
          lat: this.decisionSmooth.lat + (fix.lat - this.decisionSmooth.lat) * w,
          lng: this.decisionSmooth.lng + (fix.lng - this.decisionSmooth.lng) * w,
        }
      : { lat: fix.lat, lng: fix.lng };

    // Speed: reported when available, otherwise derived from movement.
    let speed = fix.speed != null && fix.speed >= 0 ? fix.speed : NaN;
    if (!Number.isFinite(speed) && prev) {
      const dt = Math.max(0.2, (fix.timestamp - prev.timestamp) / 1000);
      speed = haversine(prev, fix) / dt;
    }
    if (!Number.isFinite(speed)) speed = 0;
    this.speedSmooth = this.speedSmooth * 0.7 + Math.min(speed, MAX_SPEED_MPS) * 0.3;

    // Heading: device course when moving, otherwise derived from the track.
    let target: number | null = null;
    if (fix.heading != null && Number.isFinite(fix.heading) && this.speedSmooth > 1) {
      target = ((fix.heading % 360) + 360) % 360;
    } else if (prev && haversine(prev, fix) > 5) {
      target = bearing(prev, fix);
    }
    if (target != null) {
      this.headingSmooth =
        this.headingSmooth == null
          ? target
          : // Snap through big genuine turns, glide through small jitter.
            lerpAngle(this.headingSmooth, target, Math.abs(angleDelta(this.headingSmooth, target)) > 60 ? 0.6 : 0.25);
    }
    return true;
  }

  /** Diagnostics snapshot; measurement only. */
  diagnostics(): GpsEngineDiag {
    return {
      offered: this.nOffered,
      accepted: this.nAccepted,
      rejected: this.nRejected,
      lastReject: this.lastReject,
    };
  }

  private reject(reason: RejectReason): false {
    this.nRejected++;
    this.lastReject = reason;
    return false;
  }

  /** Last reliable state, or null before the first accepted fix. */
  state(now = performance.now()): GpsState | null {
    const p = this.smooth;
    const raw = this.accepted;
    if (!p || !raw) return null;
    const d = this.decisionSmooth ?? p;
    return {
      lat: p.lat,
      lng: p.lng,
      dLat: d.lat,
      dLng: d.lng,
      heading: this.headingSmooth,
      speed: this.speedSmooth,
      accuracy: raw.accuracy,
      at: this.acceptedAt,
      stale: now - this.acceptedAt > STALE_AFTER_MS,
    };
  }

  /** Force the smoothed position (used after a Roads API match). */
  override(p: LatLng): void {
    this.smooth = p;
  }

  reset(): void {
    this.accepted = null;
    this.smooth = null;
    this.decisionSmooth = null;
    this.headingSmooth = null;
    this.speedSmooth = 0;
    this.rejects = 0;
  }
}

function accuracyWeight(accuracy: number): number {
  if (!Number.isFinite(accuracy)) return 0.5;
  if (accuracy <= 10) return 0.85;
  if (accuracy <= 25) return 0.6;
  if (accuracy <= 60) return 0.4;
  if (accuracy <= 150) return 0.3;
  // Vague fixes still nudge the position, but only gently.
  if (accuracy <= 500) return 0.18;
  return 0.1;
}
