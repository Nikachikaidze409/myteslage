// The single owner of browser geolocation for the whole app.
//
// One persistent watchPosition() exists at any time. Every consumer (the
// navigation engine, the driving screen, the status panel) subscribes here
// instead of starting its own watcher.

export interface TrackedFix {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  /** device clock time of the reading */
  timestamp: number;
  /** how old the reading already was when it reached us, in ms */
  age: number;
  source: "geolocation" | "phone";
}

type FixListener = (f: TrackedFix) => void;
type ErrListener = (message: string, code: number) => void;

interface SubOpts {
  /** minimum ms between callbacks; 0 = every reading */
  minIntervalMs?: number;
}

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 5000,
};

class GeoTracker {
  private watchId: number | null = null;
  private subs = new Map<FixListener, { min: number; last: number }>();
  private errs = new Set<ErrListener>();
  private starts = 0;

  /** Rolling reading frequency, Hz. */
  private times: number[] = [];

  last: TrackedFix | null = null;

  get active(): boolean {
    return this.watchId != null;
  }

  get hz(): number {
    if (this.times.length < 2) return 0;
    const span = (this.times[this.times.length - 1] - this.times[0]) / 1000;
    return span > 0 ? (this.times.length - 1) / span : 0;
  }

  /** Reference counted: the watcher stops when the last owner releases it. */
  start(): () => void {
    this.starts++;
    this.ensureWatch();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.starts = Math.max(0, this.starts - 1);
      if (this.starts === 0) this.stop();
    };
  }

  stop(): void {
    if (this.watchId != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.times = [];
  }

  subscribe(fn: FixListener, opts: SubOpts = {}): () => void {
    this.subs.set(fn, { min: opts.minIntervalMs ?? 0, last: 0 });
    if (this.last) fn(this.last);
    return () => this.subs.delete(fn);
  }

  onError(fn: ErrListener): () => void {
    this.errs.add(fn);
    return () => this.errs.delete(fn);
  }

  /** Inject a fix coming from a paired phone through the same pipeline. */
  push(fix: Omit<TrackedFix, "age" | "source"> & { source?: TrackedFix["source"] }): void {
    this.emit({
      ...fix,
      age: Math.max(0, Date.now() - fix.timestamp),
      source: fix.source ?? "phone",
    });
  }

  private ensureWatch(): void {
    if (this.watchId != null) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      this.fail("This browser does not expose the Geolocation API.", 2);
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      this.fail("Geolocation needs a secure (HTTPS) context.", 1);
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.emit({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp,
          age: Math.max(0, Date.now() - pos.timestamp),
          source: "geolocation",
        });
      },
      (err) => this.fail(describeError(err), err.code),
      OPTIONS,
    );
  }

  private emit(fix: TrackedFix): void {
    this.last = fix;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.times.push(now);
    if (this.times.length > 20) this.times.shift();

    for (const [fn, meta] of this.subs) {
      if (meta.min > 0 && now - meta.last < meta.min) continue;
      meta.last = now;
      try {
        fn(fix);
      } catch {
        /* a broken listener must not kill the pipeline */
      }
    }
  }

  private fail(message: string, code: number): void {
    for (const fn of this.errs) fn(message, code);
  }
}

function describeError(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Permission denied. Enable location access in the Tesla browser settings.";
    case err.POSITION_UNAVAILABLE:
      return "Position unavailable. The browser could not determine a location.";
    case err.TIMEOUT:
      return "Still searching for a live GPS fix. Keep this page open.";
    default:
      return err.message || "Unknown geolocation error.";
  }
}

export const geoTracker = new GeoTracker();
