// Two reused polylines: the travelled part (dim) and the road ahead (bright).
// Never recreated while driving; only setPath is called, and only on a throttle.

import { decodePolyline } from "@/lib/geo";
import { buildPathIndex, remainingPath, type PathIndex, type Projection } from "@/lib/route-progress";

export class RouteRenderer {
  private map: any;
  private google: any;
  private ahead: any = null;
  private behind: any = null;
  private alternates: any[] = [];
  private encoded: string | null = null;
  private index: PathIndex | null = null;
  private lastTrimAt = 0;
  private lastTrim: { segment: number; lat: number; lng: number } | null = null;

  constructor(map: any, google: any) {
    this.map = map;
    this.google = google;
  }

  get pathIndex(): PathIndex | null {
    return this.index;
  }

  /** Returns true when the geometry actually changed. */
  setRoute(encoded: string | null): boolean {
    if (encoded === this.encoded) return false;
    this.encoded = encoded;
    this.lastTrim = null;
    if (!encoded) {
      this.index = null;
      this.ahead?.setMap(null);
      this.behind?.setMap(null);
      this.ahead = null;
      this.behind = null;
      return true;
    }
    const path = decodePolyline(encoded);
    this.index = buildPathIndex(path);
    const g = this.google;
    if (!this.behind) {
      this.behind = new g.maps.Polyline({
        map: this.map,
        path: [],
        strokeColor: "#94a3b8",
        strokeOpacity: 0.7,
        strokeWeight: 6,
        zIndex: 3,
        clickable: false,
      });
    }
    if (!this.ahead) {
      this.ahead = new g.maps.Polyline({
        map: this.map,
        path,
        strokeColor: "#1d4ed8",
        strokeOpacity: 0.95,
        strokeWeight: 7,
        zIndex: 5,
        clickable: false,
      });
    } else {
      this.ahead.setPath(path);
      this.ahead.setMap(this.map);
      this.behind.setPath([]);
      this.behind.setMap(this.map);
    }
    return true;
  }

  /** Trim the travelled part behind the car. Throttled; safe to call per frame. */
  trim(proj: Projection | null, now: number): void {
    const idx = this.index;
    if (!idx || !proj || !this.ahead || !this.behind) return;
    if (now - this.lastTrimAt < 500) return;
    // Standing still (traffic light, parked) must not redraw two polylines.
    const prev = this.lastTrim;
    if (
      prev &&
      prev.segment === proj.segment &&
      Math.abs(prev.lat - proj.point.lat) < 2e-5 &&
      Math.abs(prev.lng - proj.point.lng) < 2e-5
    ) {
      return;
    }
    this.lastTrimAt = now;
    this.lastTrim = { segment: proj.segment, lat: proj.point.lat, lng: proj.point.lng };
    this.ahead.setPath(remainingPath(idx, proj));
    this.behind.setPath([...idx.path.slice(0, proj.segment + 1), proj.point]);
  }

  setAlternates(list: { encodedPolyline: string; index: number }[], onSelect?: (i: number) => void): void {
    for (const l of this.alternates) {
      this.google.maps.event?.clearInstanceListeners?.(l);
      l.setMap(null);
    }
    this.alternates = [];
    const g = this.google;
    for (const alt of list) {
      if (!alt.encodedPolyline || alt.encodedPolyline === this.encoded) continue;
      const line = new g.maps.Polyline({
        map: this.map,
        path: decodePolyline(alt.encodedPolyline),
        strokeColor: "#94a3b8",
        strokeOpacity: 0.75,
        strokeWeight: 5,
        zIndex: 1,
        clickable: true,
      });
      line.addListener("click", () => onSelect?.(alt.index));
      this.alternates.push(line);
    }
  }

  fitRoute(): void {
    if (!this.index || !this.index.path.length) return;
    const g = this.google;
    const bounds = new g.maps.LatLngBounds();
    for (const p of this.index.path) bounds.extend(p);
    this.map.fitBounds(bounds, 80);
  }

  destroy(): void {
    this.ahead?.setMap(null);
    this.behind?.setMap(null);
    for (const l of this.alternates) {
      this.google.maps.event?.clearInstanceListeners?.(l);
      l.setMap(null);
    }
    this.alternates = [];
    this.lastTrim = null;
    this.ahead = null;
    this.behind = null;
    this.index = null;
  }
}
