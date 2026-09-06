// One place that knows how to create the Google map instance.
// Vector (WebGL) rendering with tilt + rotation when the Map ID allows it,
// automatic raster fallback otherwise.

import { loadGoogleMaps } from "@/lib/maps-loader";

/** Cloud-configured vector Map ID. Override per environment if needed. */
export const MAP_ID: string =
  (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() ||
  "90416c59a9ac912b9f4cae5a";

export const DEFAULT_CENTER = { lat: 41.7151, lng: 44.8271 };

const LAST_POS_KEY = "tmg:last-map-center";

/** Remember where the driver was so the next launch opens on that area. */
export function rememberCenter(p: { lat: number; lng: number }): void {
  try {
    localStorage.setItem(LAST_POS_KEY, JSON.stringify({ lat: p.lat, lng: p.lng }));
  } catch {
    /* storage disabled */
  }
}

function lastCenter(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(LAST_POS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.lat === "number" && typeof v?.lng === "number") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export interface CreatedMap {
  google: any;
  map: any;
  /** true when Google is rendering vectors (tilt, heading and WebGL overlays) */
  vector: boolean;
}

export async function createMap(container: HTMLElement): Promise<CreatedMap> {
  const google = await loadGoogleMaps();

  const start = lastCenter();
  const options: Record<string, unknown> = {
    center: start ?? DEFAULT_CENTER,
    zoom: start ? 15 : 7,
    disableDefaultUI: true,
    zoomControl: false,
    gestureHandling: "greedy",
    // Wheel / trackpad zoom is disabled on purpose: drivers use the large
    // +/- buttons, and stray scroll gestures must not change the view.
    scrollwheel: false,
    // Double-tap / double-click zoom is a gesture too: only +/- may zoom.
    disableDoubleClickZoom: true,
    clickableIcons: true,
    keyboardShortcuts: false,
    maxZoom: 20,
    minZoom: 4,
    isFractionalZoomEnabled: true,
    backgroundColor: "#f1f5f9",
    mapId: MAP_ID,
  };
  if (google.maps.RenderingType?.VECTOR) {
    options.renderingType = google.maps.RenderingType.VECTOR;
    // Gesture-driven tilt / rotate are off: display mode owns pitch and the
    // navigation camera owns heading.
    options.tiltInteractionEnabled = false;
    options.headingInteractionEnabled = false;
  }

  let map: any;
  try {
    map = new google.maps.Map(container, options);
  } catch {
    // A bad / raster-only Map ID must never leave the driver without a map.
    delete options.mapId;
    delete options.renderingType;
    map = new google.maps.Map(container, { ...options, styles: LIGHT_STYLE });
  }

  const vector = detectVector(google, map);
  return { google, map, vector };
}

function detectVector(google: any, map: any): boolean {
  try {
    const rt = map.getRenderingType?.();
    if (rt && google.maps.RenderingType?.VECTOR) return rt === google.maps.RenderingType.VECTOR;
    // Unknown yet: WebGLOverlayView plus a Map ID is a good proxy.
    return !!google.maps.WebGLOverlayView && !!MAP_ID;
  } catch {
    return false;
  }
}

/** Only used when the Map ID cannot be applied (raster fallback). */
const LIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fef3c7" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#fcd34d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bfdbfe" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "simplified" }] },
];
