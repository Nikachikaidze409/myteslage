// Draws the car as a rotated arrow marker.
//
// A marker symbol's rotation is expressed in screen space, so the map's own
// heading has to be subtracted: on a heading-up (rotated) map the arrow must
// stay pointing up the screen while the basemap turns underneath it.

import type { LatLng } from "./math";

export class VehicleRenderer {
  private map: any;
  private google: any;
  private marker: any = null;
  private accuracyCircle: any = null;
  private heading = 0;
  private iconRotation = -999;
  private pos: LatLng | null = null;
  private circle: { lat: number; lng: number; r: number } | null = null;
  private headingListener: any = null;

  constructor(map: any, google: any, _vector: boolean) {
    this.map = map;
    this.google = google;
    this.marker = new google.maps.Marker({
      map,
      title: "You",
      zIndex: 1000,
      optimized: false,
      clickable: false,
      icon: arrowIcon(google, 0),
    });
    // The screen-space rotation depends on the camera, so redraw when it turns.
    this.headingListener = map.addListener?.("heading_changed", () => this.applyRotation());
  }

  setPose(lat: number, lng: number, heading: number): void {
    if (!this.marker) return;
    this.heading = heading;
    // Sub-centimetre moves cost a Maps redraw and change nothing on screen.
    const moved =
      !this.pos || Math.abs(this.pos.lat - lat) > 2e-6 || Math.abs(this.pos.lng - lng) > 2e-6;
    if (moved) {
      this.pos = { lat, lng };
      this.marker.setPosition({ lat, lng });
    }
    this.applyRotation();
  }

  private applyRotation(): void {
    if (!this.marker) return;
    const mapHeading = this.map.getHeading?.() ?? 0;
    const screen = ((this.heading - mapHeading) % 360 + 360) % 360;
    if (Math.abs(shortestDelta(screen, this.iconRotation)) < 1.5) return;
    this.iconRotation = screen;
    this.marker.setIcon(arrowIcon(this.google, screen));
  }

  /** Google-style translucent circle, only while the fix is genuinely vague. */
  setAccuracy(center: LatLng, metres: number, visible: boolean): void {
    const g = this.google;
    if (!visible) {
      this.accuracyCircle?.setMap(null);
      this.accuracyCircle = null;
      this.circle = null;
      return;
    }
    if (!this.accuracyCircle) {
      this.accuracyCircle = new g.maps.Circle({
        map: this.map,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.5,
        strokeWeight: 1,
        fillColor: "#3b82f6",
        fillOpacity: 0.1,
        clickable: false,
        zIndex: 2,
      });
    }
    const prev = this.circle;
    if (
      prev &&
      Math.abs(prev.r - metres) < 1 &&
      Math.abs(prev.lat - center.lat) < 5e-6 &&
      Math.abs(prev.lng - center.lng) < 5e-6
    ) {
      return;
    }
    this.circle = { lat: center.lat, lng: center.lng, r: metres };
    this.accuracyCircle.setCenter(center);
    this.accuracyCircle.setRadius(metres);
  }

  destroy(): void {
    this.headingListener?.remove?.();
    this.headingListener = null;
    this.marker?.setMap(null);
    this.marker = null;
    this.accuracyCircle?.setMap(null);
    this.accuracyCircle = null;
  }
}

function shortestDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/** Chevron pointing straight up at rotation 0, drawn around its own centre. */
const ARROW_PATH = "M 0 -9 L 6.5 8 L 0 4 L -6.5 8 Z";

function arrowIcon(g: any, rotation: number) {
  return {
    path: ARROW_PATH,
    scale: 1.5,
    rotation,
    fillColor: "#2563eb",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2.5,
    anchor: new g.maps.Point(0, 0),
  };
}
