// The single owner of the driving animation.
//
//   raw GPS -> gpsEngine -> Roads / route matching -> prediction ->
//   requestAnimationFrame -> vehicle + camera + route trimming
//
// Exactly one rAF loop and one camera loop exist while this is attached.
// React never renders from inside the loop: it subscribes to a throttled
// snapshot instead.

import { projectOnPath, pointAtAlong, remainingMeters, bearingBetween, type Projection } from "@/lib/route-progress";
import { CameraEngine } from "./cameraEngine";
import { GpsEngine, type GpsState, type RawFix } from "./gpsEngine";
import { HeadingEngine, type HeadingDebug } from "./headingEngine";
import { geoTracker } from "./geoTracker";
import { RoadsMatcher } from "./roadsService";
import { RouteRenderer } from "./routeRenderer";
import { VehicleRenderer } from "./vehicleRenderer";
import { dampFactor, haversine, lerp, type LatLng } from "./math";

export type NavState =
  | "IDLE"
  | "ROUTE_PREVIEW"
  | "NAVIGATING"
  | "APPROACHING_TURN"
  | "TURNING"
  | "OFF_ROUTE"
  | "REROUTING"
  | "ARRIVED";

export interface NavSnapshot {
  state: NavState;
  /** metres left along the active route */
  remainingMeters: number;
  /** metres travelled along the active route */
  along: number;
  /** perpendicular distance from the route */
  offset: number;
  /** live position actually shown on screen */
  position: LatLng | null;
  heading: number;
  speed: number;
  /** true while GPS has gone quiet */
  weakSignal: boolean;
  /** development diagnostics; never used for rendering */
  debug: NavDebug;
}

export interface NavDebug extends HeadingDebug {
  accuracy: number;
  gpsAge: number;
  gpsSpeed: number;
  offsetFromRoute: number;
  fps: number;
  gpsHz: number;
  lastFixAt: number;
  rejected: number;
  lastReject: string | null;
}

type Listener = (s: NavSnapshot) => void;

/** Confirmed off-route distance, with hysteresis to avoid flapping. */
const OFF_ROUTE_M = 40;
const BACK_ON_ROUTE_M = 22;
const OFF_ROUTE_CONFIRM_MS = 2500;
/** Dead reckoning never runs longer than this without a real fix. */
const MAX_PREDICT_S = 5;

export class NavigationEngine {
  readonly gps = new GpsEngine();
  readonly heading = new HeadingEngine();
  private roads = new RoadsMatcher();
  private camera: CameraEngine;
  private vehicle: VehicleRenderer;
  readonly route: RouteRenderer;

  private map: any;
  private raf: number | null = null;
  private lastFrame = 0;
  private listeners = new Set<Listener>();
  private lastEmit = 0;

  private rendered: LatLng | null = null;
  private renderedHeading = 0;
  private fps = 60;
  private lastFixWallClock = 0;
  private proj: Projection | null = null;
  private predictedAlong = 0;

  private navigating = false;
  private hasRoute = false;
  private offRouteSince: number | null = null;
  private state: NavState = "IDLE";
  private rerouting = false;

  /** Set by the UI so the engine can ask for a new route exactly once. */
  onRerouteNeeded: (() => void) | null = null;

  follow = false;
  onFollowChange: ((v: boolean) => void) | null = null;

  constructor(map: any, google: any, vector: boolean) {
    this.map = map;
    this.camera = new CameraEngine(map, google, { vector, headingUp: true });
    this.vehicle = new VehicleRenderer(map, google, vector);
    this.route = new RouteRenderer(map, google);
    this.heading.attach();
    this.raf = requestAnimationFrame(this.step);
  }

  // ---- inputs ------------------------------------------------------------

  pushFix(fix: RawFix): void {
    const now = performance.now();
    if (!this.gps.ingest(fix, now)) return;
    const s = this.gps.state(now);
    if (!s) return;

    this.lastFixWallClock = fix.timestamp;
    // Physical heading is decided by its own engine, never by the route.
    this.heading.setGps(s.heading, s.speed, s.accuracy);

    if (!this.rendered) {
      this.rendered = { lat: s.lat, lng: s.lng };
      this.camera.reset(this.rendered);
    }

    // While navigating, the route is the best road model there is; Roads API
    // is only used when driving free (no active route).
    const idx = this.route.pathIndex;
    if (this.navigating && idx) {
      const p = projectOnPath({ lat: s.lat, lng: s.lng }, idx, this.proj?.along, 800);
      if (p) {
        this.proj = p;
        this.predictedAlong = p.along;
        if (p.offset < BACK_ON_ROUTE_M) {
          // Confidently on the route: render the matched point, like Google.
          this.gps.override(p.point);
          this.offRouteSince = null;
          if (this.state === "OFF_ROUTE") this.setState("NAVIGATING");
        } else if (p.offset > OFF_ROUTE_M) {
          if (this.offRouteSince == null) this.offRouteSince = now;
          if (now - this.offRouteSince > OFF_ROUTE_CONFIRM_MS && !this.rerouting) {
            this.rerouting = true;
            this.setState("REROUTING");
            this.onRerouteNeeded?.();
          } else if (this.state === "NAVIGATING" || this.state === "APPROACHING_TURN") {
            this.setState("OFF_ROUTE");
          }
        }
      }
    } else {
      void this.roads.maybeSnap({ lat: s.lat, lng: s.lng }, now).then((snapped) => {
        if (snapped && !this.navigating) this.gps.override(snapped);
      });
    }

    // Route bearing is a navigation reference only.
    const pidx = this.route.pathIndex;
    if (pidx && this.proj) {
      const a = pointAtAlong(pidx, this.proj.along);
      const b = pointAtAlong(pidx, Math.min(pidx.total, this.proj.along + 15));
      this.heading.setRouteBearing(haversine(a, b) > 1 ? bearingBetween(a, b) : null);
    } else {
      this.heading.setRouteBearing(null);
    }
    this.heading.select(now);
  }

  setRoute(encoded: string | null): void {
    const changed = this.route.setRoute(encoded);
    this.hasRoute = !!encoded;
    if (changed) {
      this.proj = null;
      this.predictedAlong = 0;
      this.offRouteSince = null;
      this.rerouting = false;
      if (!encoded) this.setState(this.navigating ? "NAVIGATING" : "IDLE");
      else this.setState(this.navigating ? "NAVIGATING" : "ROUTE_PREVIEW");
      if (!this.navigating) this.route.fitRoute();
    }
  }

  setNavigating(on: boolean): void {
    if (this.navigating === on) return;
    this.navigating = on;
    this.rerouting = false;
    this.offRouteSince = null;
    this.setState(on ? "NAVIGATING" : this.hasRoute ? "ROUTE_PREVIEW" : "IDLE");
    if (on) this.setFollow(true);
    else this.camera.setOptions({ headingUp: true });
  }

  setFollow(on: boolean): void {
    if (this.follow === on) return;
    this.follow = on;
    this.camera.enabled = on;
    if (on && this.rendered) this.camera.reset(this.rendered);
    this.onFollowChange?.(on);
  }

  recenter(): void {
    this.setFollow(true);
    if (this.rendered) {
      this.camera.reset(this.rendered);
      this.map.panTo(this.rendered);
      if ((this.map.getZoom?.() ?? 0) < 16) this.map.setZoom(17);
    }
  }

  /** A user gesture wins over the camera until they recenter. */
  releaseFollow(): void {
    this.setFollow(false);
  }

  suppressCamera(ms: number): void {
    this.camera.suppress(ms);
  }

  currentPosition(): LatLng | null {
    return this.rendered;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  destroy(): void {
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.listeners.clear();
    this.heading.destroy();
    this.vehicle.destroy();
    this.route.destroy();
  }

  // ---- the one loop ------------------------------------------------------

  private step = (now: number) => {
    this.raf = requestAnimationFrame(this.step);
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = now;
    if (dt > 0) this.fps = this.fps * 0.9 + (1 / dt) * 0.1;

    const s = this.gps.state(now);
    if (!s || !this.rendered) return;

    const target = this.predict(s, now, dt);

    // Glide toward the predicted position instead of teleporting to it.
    const k = dampFactor(0.28, dt);
    this.rendered = {
      lat: lerp(this.rendered.lat, target.point.lat, k),
      lng: lerp(this.rendered.lng, target.point.lng, k),
    };
    this.renderedHeading = this.heading.render(dt);

    this.vehicle.setPose(this.rendered.lat, this.rendered.lng, this.renderedHeading);
    this.vehicle.setAccuracy(this.rendered, s.accuracy, s.accuracy > 40);

    this.camera.update(
      { center: this.rendered, heading: this.renderedHeading, speed: s.speed },
      dt,
      now,
      this.navigating,
    );

    if (this.navigating) this.route.trim(this.proj, now);

    this.emit(now, s);
  };

  /**
   * Where the car should be right now: along the route when navigating,
   * otherwise dead reckoning from the last reliable fix. Never extrapolates
   * for more than a few seconds.
   */
  private predict(s: GpsState, now: number, dt: number): { point: LatLng; heading: number } {
    const idx = this.route.pathIndex;
    const since = Math.min(MAX_PREDICT_S, (now - s.at) / 1000);

    if (this.navigating && idx && this.proj) {
      // Advance along the route geometry at the measured speed.
      this.predictedAlong = Math.min(
        idx.total,
        Math.max(this.proj.along, this.predictedAlong + s.speed * dt),
      );
      const capped = Math.min(idx.total, this.proj.along + s.speed * since);
      const along = Math.min(this.predictedAlong, capped);
      const point = pointAtAlong(idx, along);
      return { point, heading: this.renderedHeading };
    }

    const heading = s.heading ?? this.renderedHeading;
    if (s.speed < 0.8 || s.stale) return { point: { lat: s.lat, lng: s.lng }, heading };
    const metres = s.speed * since;
    const rad = (heading * Math.PI) / 180;
    const dLat = (metres * Math.cos(rad)) / 6371000;
    const dLng = (metres * Math.sin(rad)) / (6371000 * Math.cos((s.lat * Math.PI) / 180));
    return {
      point: { lat: s.lat + (dLat * 180) / Math.PI, lng: s.lng + (dLng * 180) / Math.PI },
      heading,
    };
  }

  private setState(next: NavState): void {
    if (this.state === next) return;
    this.state = next;
    this.lastEmit = 0; // push the change out on the next frame
  }

  /** Approaching-turn detection lives here so the UI stays declarative. */
  private emit(now: number, s: GpsState): void {
    if (now - this.lastEmit < 500) return;
    this.lastEmit = now;
    const idx = this.route.pathIndex;
    const remaining = idx && this.proj ? remainingMeters(idx, this.proj) : 0;

    if (this.navigating && idx && this.proj && remaining < 30) this.setState("ARRIVED");

    const snap: NavSnapshot = {
      state: this.state,
      remainingMeters: remaining,
      along: this.proj?.along ?? 0,
      offset: this.proj?.offset ?? 0,
      position: this.rendered,
      heading: this.renderedHeading,
      speed: s.speed,
      weakSignal: s.stale,
      debug: {
        ...this.heading.debug(),
        accuracy: s.accuracy,
        gpsAge: s.age,
        gpsSpeed: s.speed,
        offsetFromRoute: this.proj?.offset ?? 0,
        fps: this.fps,
        gpsHz: geoTracker.hz,
        lastFixAt: this.lastFixWallClock,
        rejected: this.gps.rejected,
        lastReject: this.gps.lastReject,
      },
    };
    for (const l of this.listeners) l(snap);
  }

  /** Called by the UI once a fresh route has arrived after a reroute. */
  rerouteResolved(): void {
    this.rerouting = false;
    this.offRouteSince = null;
    this.setState(this.navigating ? "NAVIGATING" : "ROUTE_PREVIEW");
  }
}
