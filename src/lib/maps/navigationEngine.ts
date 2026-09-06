// The single owner of the driving animation.
//
//   raw GPS -> gpsEngine -> RouteProgressEngine (decisions) ->
//   requestAnimationFrame -> vehicle + camera + route trimming
//
// Route matching and off-route decisions happen only when a fix arrives.
// The rAF loop below renders and interpolates; it never makes decisions.

import { pointAtAlong, remainingMeters, bearingBetween, type Projection } from "@/lib/route-progress";
import type { RouteStep } from "@/lib/routes.functions";
import { CameraEngine } from "./cameraEngine";
import { rememberCenter } from "./googleMapsService";
import { GpsEngine, type GpsState, type RawFix } from "./gpsEngine";
import { RoadsMatcher } from "./roadsService";
import { RouteRenderer } from "./routeRenderer";
import { RouteProgressEngine, type MatchState } from "./routeProgressEngine";
import { VehicleRenderer } from "./vehicleRenderer";
import { dampFactor, haversine, lerp, lerpAngle, type LatLng } from "./math";

export type NavState =
  | "IDLE"
  | "ROUTE_PREVIEW"
  | "NAVIGATING"
  | "APPROACHING_MANEUVER"
  | "MANEUVER_MISSED"
  | "OFF_ROUTE"
  | "REROUTING"
  | "ROUTE_UPDATED"
  | "ARRIVED";

export interface NavDebug {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number;
  gpsHeading: number | null;
  segment: number;
  step: number;
  along: number;
  prevAlong: number;
  offset: number;
  routeBearing: number;
  headingDiff: number;
  confidence: number;
  direction: string;
  threshold: number;
  strikes: number;
  maneuver: string | null;
  maneuverDistance: number;
  lastRerouteAt: number | null;
  rerouteCount: number;
  log: string[];
}

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
  debug: NavDebug | null;
}

type Listener = (s: NavSnapshot) => void;

/** Dead reckoning never runs longer than this without a real fix. */
const MAX_PREDICT_S = 5;
/** Short debounce so GPS noise cannot fire two reroutes back to back. */
const REROUTE_DEBOUNCE_MS = 2000;
/** A maneuver closer than this puts the UI in approach mode. */
const APPROACH_M = 150;

export class NavigationEngine {
  readonly gps = new GpsEngine();
  private roads = new RoadsMatcher();
  private camera: CameraEngine;
  private vehicle: VehicleRenderer;
  readonly route: RouteRenderer;
  private progress = new RouteProgressEngine();

  private map: any;
  private raf: number | null = null;
  private lastFrame = 0;
  private listeners = new Set<Listener>();
  private lastEmit = 0;
  private lastRemember = 0;

  private rendered: LatLng | null = null;
  private renderedHeading = 0;
  private proj: Projection | null = null;
  private predictedAlong = 0;
  private debug: NavDebug | null = null;

  private navigating = false;
  private hasRoute = false;
  private state: NavState = "IDLE";
  private rerouting = false;
  private lastRerouteAt = 0;
  private rerouteCount = 0;

  /** Set by the UI so the engine can ask for a new route exactly once. */
  onRerouteNeeded: (() => void) | null = null;

  follow = false;
  onFollowChange: ((v: boolean) => void) | null = null;

  constructor(map: any, google: any, vector: boolean) {
    this.map = map;
    this.camera = new CameraEngine(map, google, { vector, headingUp: true });
    this.vehicle = new VehicleRenderer(map, google, vector);
    this.route = new RouteRenderer(map, google);
    this.raf = requestAnimationFrame(this.step);
  }

  // ---- inputs ------------------------------------------------------------

  pushFix(fix: RawFix): void {
    const now = performance.now();
    if (!this.gps.ingest(fix, now)) return;
    const s = this.gps.state(now);
    if (!s) return;

    if (!this.rendered) {
      this.rendered = { lat: s.lat, lng: s.lng };
      this.renderedHeading = s.heading ?? 0;
      this.camera.reset(this.rendered);
    }

    if (this.navigating && this.progress.pathIndex) {
      const res = this.progress.update(
        { lat: s.lat, lng: s.lng, heading: s.heading, speed: s.speed, accuracy: s.accuracy },
        now,
      );
      if (res) {
        const { match, verdict } = res;
        this.proj = this.progress.projection();
        this.predictedAlong = match.along;

        // Only render the matched point while we are confident it is right;
        // otherwise the raw position is more honest than a wrong road.
        if (match.offset < verdict.threshold * 0.7 && match.confidence > 0.4) {
          this.gps.override(match.point);
        }

        const man = this.progress.nextManeuver();
        this.updateDebug(s, match, verdict.threshold, verdict.strikes, man);

        if (verdict.offRoute && !this.rerouting) {
          if (now - this.lastRerouteAt > REROUTE_DEBOUNCE_MS || this.lastRerouteAt === 0) {
            this.lastRerouteAt = now;
            this.rerouteCount++;
            this.rerouting = true;
            this.setState(verdict.maneuverMissed ? "MANEUVER_MISSED" : "OFF_ROUTE");
            this.setState("REROUTING");
            this.onRerouteNeeded?.();
          }
        } else if (!this.rerouting) {
          const remaining = this.proj ? remainingMeters(this.progress.pathIndex!, this.proj) : 0;
          if (remaining < 30) this.setState("ARRIVED");
          else if (man && man.distance < APPROACH_M) this.setState("APPROACHING_MANEUVER");
          else this.setState("NAVIGATING");
        }
      }
    } else {
      void this.roads.maybeSnap({ lat: s.lat, lng: s.lng }, now).then((snapped) => {
        if (snapped && !this.navigating) this.gps.override(snapped);
      });
    }
  }

  setRoute(encoded: string | null, steps: RouteStep[] = []): void {
    const changed = this.route.setRoute(encoded);
    this.hasRoute = !!encoded;
    if (!changed) return;
    const idx = this.route.pathIndex;
    this.progress.setRoute(idx ? idx.path : null, steps);
    this.proj = null;
    this.predictedAlong = 0;
    if (!encoded) this.setState(this.navigating ? "NAVIGATING" : "IDLE");
    else this.setState(this.navigating ? "ROUTE_UPDATED" : "ROUTE_PREVIEW");
    if (!this.navigating) this.route.fitRoute();
  }

  setNavigating(on: boolean): void {
    if (this.navigating === on) return;
    this.navigating = on;
    this.rerouting = false;
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

  /** Flat top-down (false) or navigation perspective (true). */
  setTilt3d(on: boolean): void {
    this.camera.setOptions({ tilt3d: on });
    if (!on) {
      try {
        this.map.setTilt?.(0);
      } catch {
        /* raster maps have no tilt */
      }
      this.camera.reset(this.rendered ?? undefined);
    }
  }

  /** Re-centre without handing control back and forth (used after layout changes). */
  keepCentered(center: LatLng): void {
    this.camera.reset(center);
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
    this.vehicle.destroy();
    this.route.destroy();
  }

  // ---- the one loop ------------------------------------------------------

  private step = (now: number) => {
    this.raf = requestAnimationFrame(this.step);
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = now;

    const s = this.gps.state(now);
    if (!s || !this.rendered) return;

    const target = this.predict(s, now, dt);

    // Glide toward the predicted position instead of teleporting to it.
    const k = dampFactor(0.28, dt);
    this.rendered = {
      lat: lerp(this.rendered.lat, target.point.lat, k),
      lng: lerp(this.rendered.lng, target.point.lng, k),
    };
    this.renderedHeading = lerpAngle(this.renderedHeading, target.heading, dampFactor(0.35, dt));

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
   * Where the car should be right now: along the route when the match is
   * trustworthy, otherwise dead reckoning from the last reliable fix.
   */
  private predict(s: GpsState, now: number, dt: number): { point: LatLng; heading: number } {
    const idx = this.progress.pathIndex;
    const match = this.progress.match;
    const since = Math.min(MAX_PREDICT_S, (now - s.at) / 1000);

    if (this.navigating && !this.rerouting && idx && this.proj && match && match.confidence > 0.4) {
      // Advance along the route geometry at the measured speed.
      this.predictedAlong = Math.min(
        idx.total,
        Math.max(this.proj.along, this.predictedAlong + s.speed * dt),
      );
      const capped = Math.min(idx.total, this.proj.along + s.speed * since);
      const along = Math.min(this.predictedAlong, capped);
      const point = pointAtAlong(idx, along);
      const nextPoint = pointAtAlong(idx, Math.min(idx.total, along + 12));
      const heading = haversine(point, nextPoint) > 1 ? bearingBetween(point, nextPoint) : this.renderedHeading;
      return { point, heading };
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
    // While a new route is being fetched, nothing may claim we are happily
    // navigating the old one.
    if (this.rerouting && (next === "NAVIGATING" || next === "APPROACHING_MANEUVER")) return;
    this.state = next;
    this.lastEmit = 0; // push the change out on the next frame
  }

  private updateDebug(
    s: GpsState,
    m: MatchState,
    threshold: number,
    strikes: number,
    man: { instruction: string; distance: number } | null,
  ): void {
    this.debug = {
      lat: s.lat,
      lng: s.lng,
      accuracy: s.accuracy,
      speed: s.speed,
      gpsHeading: s.heading,
      segment: m.segment,
      step: m.step,
      along: m.along,
      prevAlong: m.prevAlong,
      offset: m.offset,
      routeBearing: m.routeBearing,
      headingDiff: m.headingDiff,
      confidence: m.confidence,
      direction: m.direction,
      threshold,
      strikes,
      maneuver: man?.instruction ?? null,
      maneuverDistance: man?.distance ?? 0,
      lastRerouteAt: this.lastRerouteAt || null,
      rerouteCount: this.rerouteCount,
      log: this.progress.logLines.slice(-8),
    };
  }

  private emit(now: number, s: GpsState): void {
    if (now - this.lastEmit < 500) return;
    this.lastEmit = now;
    if (this.rendered && now - this.lastRemember > 15000) {
      this.lastRemember = now;
      rememberCenter(this.rendered);
    }
    const idx = this.progress.pathIndex;
    const remaining = idx && this.proj ? remainingMeters(idx, this.proj) : 0;

    const snap: NavSnapshot = {
      state: this.state,
      remainingMeters: remaining,
      along: this.proj?.along ?? 0,
      offset: this.proj?.offset ?? 0,
      position: this.rendered,
      heading: this.renderedHeading,
      speed: s.speed,
      weakSignal: s.stale,
      debug: this.debug,
    };
    for (const l of this.listeners) l(snap);
  }

  /** Called by the UI once a fresh route has arrived after a reroute. */
  rerouteResolved(): void {
    if (!this.rerouting) return;
    this.rerouting = false;
    this.progress.markRerouted();
    this.setState(this.navigating ? "NAVIGATING" : "ROUTE_PREVIEW");
  }
}
