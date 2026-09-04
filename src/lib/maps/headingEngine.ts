// Decides which way the car is actually facing, independently of the route.
//
//   GPS course  (good while moving)
//   device compass (good while slow / stopped, when the browser exposes it)
//   route bearing (last resort reference only)
//
// Each source carries a confidence; the highest confidence wins, the result is
// smoothed frame by frame and always rotates the short way around north.

import { angleDelta, dampFactor, lerpAngle } from "./math";

export type HeadingSource = "gps" | "device" | "route" | "hold" | "none";

export interface HeadingDebug {
  gps: number | null;
  gpsConfidence: number;
  device: number | null;
  deviceConfidence: number;
  route: number | null;
  filtered: number;
  source: HeadingSource;
  confidence: number;
}

const norm = (d: number) => ((d % 360) + 360) % 360;

export class HeadingEngine {
  /** rendered (smoothed) heading */
  private current = 0;
  private target = 0;
  private started = false;

  private gps: number | null = null;
  private gpsConf = 0;
  private device: number | null = null;
  private deviceConf = 0;
  private deviceAt = 0;
  private route: number | null = null;

  private source: HeadingSource = "none";
  private confidence = 0;
  private detach: (() => void) | null = null;

  /** One compass listener, attached once. */
  attach(): void {
    if (this.detach || typeof window === "undefined") return;
    const onOrient = (ev: any) => {
      let deg: number | null = null;
      let conf = 0;
      if (typeof ev.webkitCompassHeading === "number" && Number.isFinite(ev.webkitCompassHeading)) {
        deg = ev.webkitCompassHeading;
        const acc = ev.webkitCompassAccuracy;
        conf = typeof acc === "number" && acc >= 0 && acc < 25 ? 0.75 : 0.45;
      } else if (typeof ev.alpha === "number" && Number.isFinite(ev.alpha)) {
        deg = 360 - ev.alpha; // alpha is counter-clockwise from north
        conf = ev.absolute ? 0.6 : 0.3;
      }
      if (deg == null) return;
      this.device = norm(deg);
      this.deviceConf = conf;
      this.deviceAt = performance.now();
    };
    window.addEventListener("deviceorientationabsolute", onOrient as EventListener, true);
    window.addEventListener("deviceorientation", onOrient as EventListener, true);
    this.detach = () => {
      window.removeEventListener("deviceorientationabsolute", onOrient as EventListener, true);
      window.removeEventListener("deviceorientation", onOrient as EventListener, true);
    };
  }

  destroy(): void {
    this.detach?.();
    this.detach = null;
  }

  /** Physical movement direction reported / derived by the GPS pipeline. */
  setGps(heading: number | null, speedMps: number, accuracyM: number): void {
    if (heading == null || !Number.isFinite(heading)) {
      this.gps = null;
      this.gpsConf = 0;
      return;
    }
    this.gps = norm(heading);
    // Confidence grows with speed and shrinks with poor accuracy.
    const speedScore = Math.min(1, Math.max(0, (speedMps - 0.8) / 6));
    const accScore = accuracyM <= 15 ? 1 : accuracyM <= 40 ? 0.7 : accuracyM <= 80 ? 0.4 : 0.15;
    this.gpsConf = speedScore * accScore;
  }

  /** Navigation reference only: never overrides a real heading source. */
  setRouteBearing(b: number | null): void {
    this.route = b == null || !Number.isFinite(b) ? null : norm(b);
  }

  /** Pick the best source and set the target angle. Cheap, call per fix. */
  select(now = performance.now()): void {
    const deviceFresh = this.device != null && now - this.deviceAt < 3000;
    const deviceConf = deviceFresh ? this.deviceConf : 0;

    let source: HeadingSource = "none";
    let value: number | null = null;
    let confidence = 0;

    if (this.gpsConf >= 0.35 && this.gpsConf >= deviceConf) {
      source = "gps";
      value = this.gps;
      confidence = this.gpsConf;
    } else if (deviceConf > 0.25) {
      source = "device";
      value = this.device;
      confidence = deviceConf;
    } else if (this.gpsConf > 0) {
      source = "gps";
      value = this.gps;
      confidence = this.gpsConf;
    } else if (this.started) {
      // Keep the last reliable heading instead of letting the arrow wander.
      source = "hold";
      value = this.target;
      confidence = 0.1;
    } else if (this.route != null) {
      source = "route";
      value = this.route;
      confidence = 0.05;
    }

    if (value == null) return;
    this.target = value;
    this.source = source;
    this.confidence = confidence;
    if (!this.started) {
      this.started = true;
      this.current = value;
    }
  }

  /**
   * Advance the rendered angle toward the target. Always takes the shortest
   * rotational path, so 359 -> 1 crosses north instead of spinning back.
   */
  render(dt: number): number {
    const diff = Math.abs(angleDelta(this.current, this.target));
    // Snap through genuine turns quickly, glide through small jitter.
    const tau = diff > 60 ? 0.18 : diff > 15 ? 0.28 : 0.45;
    this.current = lerpAngle(this.current, this.target, dampFactor(tau, dt));
    return this.current;
  }

  get heading(): number {
    return this.current;
  }

  debug(): HeadingDebug {
    return {
      gps: this.gps,
      gpsConfidence: this.gpsConf,
      device: this.device,
      deviceConfidence: this.deviceConf,
      route: this.route,
      filtered: this.current,
      source: this.source,
      confidence: this.confidence,
    };
  }

  reset(): void {
    this.started = false;
    this.gps = null;
    this.gpsConf = 0;
    this.route = null;
    this.source = "none";
    this.confidence = 0;
  }
}
