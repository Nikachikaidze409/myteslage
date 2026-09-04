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
    map.addListener?.("heading_changed", () => this.applyRotation());
  }

  setPose(lat: number, lng: number, heading: number): void {
    if (!this.marker) return;
    this.heading = heading;
    this.marker.setPosition({ lat, lng });
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
    this.accuracyCircle.setCenter(center);
    this.accuracyCircle.setRadius(metres);
  }

  destroy(): void {
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
