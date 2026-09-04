// Draws the car on a flat 2D map: one reused marker with a rotated arrow
// symbol. No WebGL overlay, no 3D — cheap enough for low-end phones.

import type { LatLng } from "./math";

export class VehicleRenderer {
  private map: any;
  private google: any;
  private marker: any = null;
  private accuracyCircle: any = null;
  private iconHeading = -999;
  private lastLat = NaN;
  private lastLng = NaN;

  constructor(map: any, google: any, _vector?: boolean) {
    this.map = map;
    this.google = google;
    this.marker = new google.maps.Marker({
      map,
      title: "You",
      zIndex: 1000,
      optimized: true,
      clickable: false,
      icon: arrowIcon(google, 0),
    });
  }

  setPose(lat: number, lng: number, heading: number): void {
    if (!this.marker) return;
    // Sub-decimetre moves are invisible: skip the marker work entirely.
    if (Math.abs(lat - this.lastLat) > 1e-6 || Math.abs(lng - this.lastLng) > 1e-6) {
      this.lastLat = lat;
      this.lastLng = lng;
      this.marker.setPosition({ lat, lng });
    }
    if (Math.abs(heading - this.iconHeading) > 2) {
      this.iconHeading = heading;
      this.marker.setIcon(arrowIcon(this.google, heading));
    }
  }

  /** Google-style translucent circle, only while the fix is genuinely vague. */
  setAccuracy(center: LatLng, metres: number, visible: boolean): void {
    const g = this.google;
    if (!visible) {
      if (this.accuracyCircle) {
        this.accuracyCircle.setMap(null);
        this.accuracyCircle = null;
      }
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

function arrowIcon(g: any, heading: number) {
  return {
    path: g.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 6,
    rotation: heading,
    fillColor: "#3b82f6",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 3,
  };
}
