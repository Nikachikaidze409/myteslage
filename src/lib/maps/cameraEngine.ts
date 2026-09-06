// Navigation camera. One instance, driven by the single animation loop.
// Uses map.moveCamera() on vector maps (smooth heading + tilt) and falls back
// to setCenter/setZoom on raster maps.

import { dampFactor, lerp, lerpAngle, offsetLatLng, type LatLng } from "./math";

export interface CameraTarget {
  center: LatLng;
  heading: number;
  /** metres per second, used to pick zoom and look-ahead */
  speed: number;
}

export interface CameraOptions {
  /** true when the map renders vectors: heading + tilt are then available */
  vector: boolean;
  /** heading-up (true) or north-up (false) */
  headingUp: boolean;
  /** false = flat top-down 2D view (pitch 0) */
  tilt3d?: boolean;
}

/** Navigation pitch used whenever 3D display mode is active. */
const NAV_TILT = 50;

export class CameraEngine {
  private map: any;
  private google: any;
  private opts: CameraOptions;
  private cur: { lat: number; lng: number; heading: number; tilt: number; zoom: number } | null = null;
  private lastApplied = 0;
  private suppressUntil = 0;
  enabled = false;

  constructor(map: any, google: any, opts: CameraOptions) {
    this.map = map;
    this.google = google;
    this.opts = opts;
  }

  /** Reports back when the renderer really refuses the requested 3D pitch. */
  onTiltUnsupported: (() => void) | null = null;
  private verifyTimer: number | null = null;

  setOptions(next: Partial<CameraOptions>): void {
    this.opts = { ...this.opts, ...next };
    // The display mode is authoritative: re-assert pitch on every write, even
    // when the flag did not change, so map and UI can never drift apart.
    if (next.tilt3d !== undefined || next.vector !== undefined) this.applyDisplayTilt();
  }

  /**
   * The display mode is the single owner of pitch. Applied immediately, even
   * when follow is off or navigation has not started, so the toggle can never
   * disagree with what is on screen.
   */
  applyDisplayTilt(): void {
    const want = this.opts.tilt3d !== false && this.opts.vector ? NAV_TILT : 0;
    if (this.cur) this.cur.tilt = want;
    this.writeTilt(want);

    if (this.verifyTimer != null) {
      window.clearTimeout(this.verifyTimer);
      this.verifyTimer = null;
    }
    if (want <= 0) return;

    // Verify late and with a retry: an early readback right after map creation
    // reports 0 while the renderer is still warming up, which is "unknown",
    // not "unsupported".
    this.verifyTimer = window.setTimeout(() => {
      if (this.opts.tilt3d === false) return;
      if ((this.map.getTilt?.() ?? 0) >= 1) return;
      this.writeTilt(want);
      this.verifyTimer = window.setTimeout(() => {
        if (this.opts.tilt3d === false) return;
        if ((this.map.getTilt?.() ?? 0) >= 1) return;
        this.opts = { ...this.opts, tilt3d: false };
        if (this.cur) this.cur.tilt = 0;
        this.writeTilt(0);
        this.onTiltUnsupported?.();
      }, 1500);
    }, 1500);
  }

  private writeTilt(want: number): void {
    try {
      if (typeof this.map.moveCamera === "function" && this.opts.vector) {
        this.map.moveCamera({ tilt: want });
      } else {
        this.map.setTilt?.(want);
      }
    } catch {
      /* raster maps have no tilt */
    }
  }


  /** What the map is actually rendering right now. */
  actualTilt(): number {
    return this.map.getTilt?.() ?? 0;
  }

  /** Called after a programmatic jump so the damping restarts from there. */
  reset(center?: LatLng): void {
    if (!center) {
      this.cur = null;
      return;
    }
    const zoom = this.map.getZoom?.() ?? 17;
    this.cur = {
      lat: center.lat,
      lng: center.lng,
      heading: this.map.getHeading?.() ?? 0,
      tilt: this.map.getTilt?.() ?? 0,
      zoom,
    };
  }

  /** Ignore camera work for a moment (user gesture, layout change). */
  suppress(ms: number): void {
    this.suppressUntil = performance.now() + ms;
  }

  update(t: CameraTarget, dt: number, now: number, navigating: boolean): void {
    if (!this.enabled || now < this.suppressUntil) return;

    const wantHeading = this.opts.vector && this.opts.headingUp && navigating ? t.heading : 0;
    const tilt3d = this.opts.tilt3d !== false;
    // Display mode owns pitch: navigation only nudges it with speed.
    const wantTilt = tilt3d && this.opts.vector ? (navigating && t.speed > 2 ? NAV_TILT + 5 : NAV_TILT) : 0;
    const wantZoom = navigating ? zoomForSpeed(t.speed) : Math.max(this.map.getZoom?.() ?? 16, 16);

    // Look ahead so the car sits in the lower third of the screen.
    const ahead = navigating ? Math.min(220, 40 + t.speed * 6) : 0;
    const wantCenter = ahead > 0 ? offsetLatLng(t.center, t.heading, ahead) : t.center;

    if (!this.cur) {
      this.cur = {
        lat: wantCenter.lat,
        lng: wantCenter.lng,
        heading: wantHeading,
        tilt: wantTilt,
        zoom: wantZoom,
      };
    }

    const kPos = dampFactor(0.35, dt);
    const kAng = dampFactor(0.6, dt);
    const kZoom = dampFactor(1.2, dt);

    this.cur.lat = lerp(this.cur.lat, wantCenter.lat, kPos);
    this.cur.lng = lerp(this.cur.lng, wantCenter.lng, kPos);
    this.cur.heading = lerpAngle(this.cur.heading, wantHeading, kAng);
    this.cur.tilt = lerp(this.cur.tilt, wantTilt, kAng);
    this.cur.zoom = lerp(this.cur.zoom, wantZoom, kZoom);

    // Skip work when nothing meaningfully changed (parked at a light).
    if (now - this.lastApplied < 33) return;
    this.lastApplied = now;

    const center = { lat: this.cur.lat, lng: this.cur.lng };
    if (this.opts.vector && typeof this.map.moveCamera === "function") {
      this.map.moveCamera({
        center,
        heading: this.cur.heading,
        tilt: this.cur.tilt,
        zoom: this.cur.zoom,
      });
    } else {
      this.map.setCenter(center);
      const z = Math.round(this.cur.zoom);
      if (z !== this.map.getZoom?.()) this.map.setZoom(z);
    }
  }
}

function zoomForSpeed(speedMps: number): number {
  const kmh = speedMps * 3.6;
  if (kmh > 100) return 15.5;
  if (kmh > 70) return 16.2;
  if (kmh > 40) return 16.8;
  if (kmh > 15) return 17.4;
  return 17.8;
}
