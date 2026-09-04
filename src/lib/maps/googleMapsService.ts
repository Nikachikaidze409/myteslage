// One place that knows how to create the Google map instance.
// Vector (WebGL) rendering with tilt + rotation when the Map ID allows it,
// automatic raster fallback otherwise.

import { loadGoogleMaps } from "@/lib/maps-loader";

/** Cloud-configured vector Map ID. Override per environment if needed. */
export const MAP_ID: string =
  (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() ||
  "90416c59a9ac912b9f4cae5a";

export const DEFAULT_CENTER = { lat: 41.7151, lng: 44.8271 };

export interface CreatedMap {
  google: any;
  map: any;
  /** true when Google is rendering vectors (tilt, heading and WebGL overlays) */
  vector: boolean;
}

export async function createMap(container: HTMLElement): Promise<CreatedMap> {
  const google = await loadGoogleMaps();

  const options: Record<string, unknown> = {
    center: DEFAULT_CENTER,
    zoom: 7,
    disableDefaultUI: true,
    zoomControl: false,
    gestureHandling: "greedy",
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
    options.tiltInteractionEnabled = true;
    options.headingInteractionEnabled = true;
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
