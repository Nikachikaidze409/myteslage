// One place that knows how to create the Google map instance.
// Deliberately flat 2D raster rendering: no Map ID, no vector/WebGL, no tilt,
// no 3D buildings. Navigation smoothness beats visual detail.

import { loadGoogleMaps } from "@/lib/maps-loader";

export const DEFAULT_CENTER = { lat: 41.7151, lng: 44.8271 };

export interface CreatedMap {
  google: any;
  map: any;
  /** always false: the map is rendered flat, no vector/WebGL features */
  vector: boolean;
}

export async function createMap(container: HTMLElement): Promise<CreatedMap> {
  const google = await loadGoogleMaps();

  const map = new google.maps.Map(container, {
    center: DEFAULT_CENTER,
    zoom: 7,
    disableDefaultUI: true,
    zoomControl: false,
    gestureHandling: "greedy",
    clickableIcons: true,
    keyboardShortcuts: false,
    maxZoom: 20,
    minZoom: 4,
    // Integer zoom levels keep raster tile work minimal on phones.
    isFractionalZoomEnabled: false,
    tilt: 0,
    backgroundColor: "#f1f5f9",
    styles: LIGHT_STYLE,
  });

  return { google, map, vector: false };
}

/** Clean 2D navigation styling: roads, names and traffic stay, clutter goes. */
const LIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#eef2f6" }] },
  { featureType: "landscape.natural.terrain", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fef3c7" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#fcd34d" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#e6f4ea" }] },
  { featureType: "poi.attraction", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bfdbfe" }] },
];
