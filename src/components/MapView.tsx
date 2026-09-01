import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps-loader";
import type { Fix } from "./StatusPanel";
import { snapToRoad } from "@/lib/snap-to-road.functions";
import { decodePolyline } from "@/lib/geo";
import {
  buildPathIndex,
  pointAtAlong,
  projectOnPath,
  remainingMeters,
  remainingPath,
  type PathIndex,
  type Projection,
} from "@/lib/route-progress";

export interface LiveProgress {
  /** metres left to the destination along the active route */
  remainingMeters: number;
  /** metres travelled along the active route */
  along: number;
  /** perpendicular distance from the route, metres */
  offset: number;
}

interface Props {
  fix: Fix | null;
  destination: { lat: number; lng: number; name?: string } | null;
  encodedPolyline: string | null;
  navigating?: boolean;
  showTraffic?: boolean;
  rerouting?: boolean;
  waypoints?: { lat: number; lng: number; name?: string }[];
  alternates?: { encodedPolyline: string; index: number }[];
  onSelectAlternate?: (index: number) => void;
  onProgress?: (p: LiveProgress) => void;
  /** Increment to programmatically trigger recenter-on-me from a parent. */
  recenterSignal?: number;
}

const DEFAULT_CENTER = { lat: 41.7151, lng: 44.8271 };
/** Smoothing time constants (seconds). Lower = snappier, higher = smoother. */
const POS_TAU = 0.35;
const CAM_TAU = 0.55;
/** How far ahead of the car the camera looks while driving (seconds of travel). */
const LOOKAHEAD_S = 4;

function shortestDelta(from: number, to: number): number {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function MapView({
  fix,
  destination,
  encodedPolyline,
  navigating,
  showTraffic,
  rerouting,
  waypoints,
  alternates,
  onSelectAlternate,
  onProgress,
  recenterSignal,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const meMarker = useRef<any>(null);
  const destMarker = useRef<any>(null);
  const waypointMarkersRef = useRef<any[]>([]);
  const trafficLayerRef = useRef<any>(null);
  const accuracyCircle = useRef<any>(null);
  const routeLine = useRef<any>(null);
  const altLinesRef = useRef<any[]>([]);
  const lastPolylineRef = useRef<string | null>(null);

  // ---- live engine state -------------------------------------------------
  const pathIdxRef = useRef<PathIndex | null>(null);
  const projRef = useRef<Projection | null>(null);
  const targetRef = useRef<{ lat: number; lng: number } | null>(null);
  const targetHeadingRef = useRef<number | null>(null);
  const renderedRef = useRef<{ lat: number; lng: number } | null>(null);
  const renderedHeadingRef = useRef<number>(0);
  const iconHeadingRef = useRef<number>(-999);
  const camRef = useRef<{ lat: number; lng: number } | null>(null);
  const speedRef = useRef<number>(0);
  const lastFixAtRef = useRef<number>(0);
  const fixIntervalRef = useRef<number>(1000);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const lastCamSetRef = useRef<number>(0);
  const lastLineUpdateRef = useRef<number>(0);
  const lastProgressAtRef = useRef<number>(0);
  const snapInFlightRef = useRef(false);
  const lastSnapAtRef = useRef(0);
  const navigatingRef = useRef<boolean>(false);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  // Follow-me camera mode. True = camera tracks the car; false = user is panning freely.
  const followRef = useRef<boolean>(false);
  const programmaticMoveRef = useRef<boolean>(false);
  const [followUi, setFollowUi] = useState(false);

  const recenterOnMe = () => {
    const map = mapRef.current;
    const pos = renderedRef.current;
    if (!map || !pos) return;
    followRef.current = true;
    setFollowUi(true);
    camRef.current = pos;
    programmaticMoveRef.current = true;
    map.panTo(pos);
    if (map.getZoom() < 16) map.setZoom(17);
    setTimeout(() => (programmaticMoveRef.current = false), 300);
  };

  // ---- map bootstrap -----------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new g.maps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 7,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          keyboardShortcuts: false,
          maxZoom: 20,
          minZoom: 4,
          isFractionalZoomEnabled: false,
          // Prefer the low-latency vector renderer on capable Tesla browsers.
          // Google falls back to raster tiles when this option is unavailable.
          renderingType: "VECTOR",
          styles: LIGHT_STYLE,
          backgroundColor: "#f1f5f9",
        });
        setMapReady(true);

        // Any user gesture disables follow-me so the camera doesn't fight the finger.
        const release = () => {
          if (programmaticMoveRef.current) return;
          if (followRef.current) {
            followRef.current = false;
            setFollowUi(false);
          }
        };
        mapRef.current.addListener("dragstart", release);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
        trafficLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    navigatingRef.current = !!navigating;
  }, [navigating]);

  // Turn follow on when navigation starts.
  useEffect(() => {
    if (!navigating) return;
    followRef.current = true;
    setFollowUi(true);
    const map = mapRef.current;
    const pos = renderedRef.current;
    if (map && pos) {
      programmaticMoveRef.current = true;
      camRef.current = pos;
      map.panTo(pos);
      if (map.getZoom() < 16) map.setZoom(17);
      setTimeout(() => (programmaticMoveRef.current = false), 300);
    }
  }, [navigating]);

  useEffect(() => {
    if (recenterSignal == null) return;
    recenterOnMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  // ---- traffic overlay ---------------------------------------------------
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    if (showTraffic) {
      if (!trafficLayerRef.current) trafficLayerRef.current = new g.maps.TrafficLayer();
      trafficLayerRef.current.setMap(map);
    } else if (trafficLayerRef.current) {
      trafficLayerRef.current.setMap(null);
    }
  }, [showTraffic, mapReady]);

  // ---- waypoints ---------------------------------------------------------
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    for (const m of waypointMarkersRef.current) m.setMap(null);
    waypointMarkersRef.current = [];
    for (const w of waypoints ?? []) {
      waypointMarkersRef.current.push(
        new g.maps.Marker({
          map,
          position: { lat: w.lat, lng: w.lng },
          title: w.name ?? "Stop",
          label: { text: "⚡", fontSize: "18px" },
          optimized: true,
        }),
      );
    }
  }, [waypoints, mapReady]);

  // ---- route polyline (reused instance) ----------------------------------
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;

    if (!encodedPolyline) {
      pathIdxRef.current = null;
      projRef.current = null;
      lastPolylineRef.current = null;
      if (routeLine.current) {
        routeLine.current.setMap(null);
        routeLine.current = null;
      }
      return;
    }

    const path = decodePolyline(encodedPolyline);
    pathIdxRef.current = buildPathIndex(path);
    projRef.current = null;

    if (!routeLine.current) {
      routeLine.current = new g.maps.Polyline({
        map,
        path,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.9,
        strokeWeight: 6,
        zIndex: 5,
        clickable: false,
      });
    } else {
      routeLine.current.setPath(path);
      routeLine.current.setMap(map);
    }

    if (!navigating && lastPolylineRef.current !== encodedPolyline) {
      const bounds = new g.maps.LatLngBounds();
      for (const p of path) bounds.extend(p);
      map.fitBounds(bounds, 60);
    }
    lastPolylineRef.current = encodedPolyline;
  }, [encodedPolyline, navigating, mapReady]);

  // ---- alternates --------------------------------------------------------
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    for (const l of altLinesRef.current) l.setMap(null);
    altLinesRef.current = [];
    for (const alt of alternates ?? []) {
      if (!alt.encodedPolyline || alt.encodedPolyline === encodedPolyline) continue;
      const line = new g.maps.Polyline({
        map,
        path: decodePolyline(alt.encodedPolyline),
        strokeColor: "#94a3b8",
        strokeOpacity: 0.75,
        strokeWeight: 5,
        zIndex: 1,
        clickable: true,
      });
      line.addListener("click", () => onSelectAlternate?.(alt.index));
      altLinesRef.current.push(line);
    }
  }, [alternates, encodedPolyline, onSelectAlternate, mapReady]);

  // ---- destination marker ------------------------------------------------
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    if (!destination) {
      if (destMarker.current) {
        destMarker.current.setMap(null);
        destMarker.current = null;
      }
      return;
    }
    if (destMarker.current) {
      destMarker.current.setPosition(destination);
      destMarker.current.setTitle(destination.name ?? "Destination");
    } else {
      destMarker.current = new g.maps.Marker({
        map,
        position: destination,
        title: destination.name ?? "Destination",
      });
    }
  }, [destination, mapReady]);

  // ---- new fix -> new target --------------------------------------------
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map || !fix) return;

    const raw = { lat: fix.lat, lng: fix.lng };
    const now = performance.now();
    if (lastFixAtRef.current) {
      const gap = now - lastFixAtRef.current;
      // Keep a running estimate of the fix cadence so the tween matches reality.
      fixIntervalRef.current = Math.min(5000, Math.max(400, gap));
    }
    lastFixAtRef.current = now;
    speedRef.current = fix.speed != null && fix.speed > 0 ? fix.speed : 0;

    // Marker + accuracy halo
    if (!meMarker.current) {
      renderedRef.current = raw;
      camRef.current = raw;
      meMarker.current = new g.maps.Marker({
        map,
        position: raw,
        title: "You",
        icon: carIcon(g, fix.heading ?? null),
        zIndex: 1000,
        optimized: true,
      });
    }
    if (!accuracyCircle.current) {
      accuracyCircle.current = new g.maps.Circle({
        map,
        center: raw,
        radius: fix.accuracy,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.6,
        strokeWeight: 1,
        fillColor: "#3b82f6",
        fillOpacity: 0.12,
        clickable: false,
      });
    } else {
      accuracyCircle.current.setRadius(fix.accuracy);
    }
    accuracyCircle.current.setVisible(fix.accuracy > 25);

    // Local snap to the active route - no network, no lag.
    const idx = pathIdxRef.current;
    let target = raw;
    let heading = fix.heading ?? null;
    if (navigating && idx) {
      const proj = projectOnPath(raw, idx, projRef.current?.along, 600);
      if (proj && proj.offset < 45) {
        projRef.current = proj;
        target = proj.point;
        if (heading == null || speedRef.current > 1.5) heading = proj.bearing;
      } else if (proj) {
        projRef.current = proj;
      }
    }
    targetRef.current = target;
    if (heading != null) targetHeadingRef.current = heading;

    // Off-route (or no route yet): fall back to the Roads API, throttled hard.
    if (!navigating || !idx) {
      const ms = Date.now();
      if (!snapInFlightRef.current && ms - lastSnapAtRef.current > 8000 && speedRef.current > 2) {
        snapInFlightRef.current = true;
        lastSnapAtRef.current = ms;
        snapToRoad({ data: { lat: raw.lat, lng: raw.lng } })
          .then((s) => {
            targetRef.current = { lat: s.lat, lng: s.lng };
          })
          .catch(() => {})
          .finally(() => {
            snapInFlightRef.current = false;
          });
      }
    }
  }, [fix, navigating]);

  // ---- single persistent animation loop ----------------------------------
  useEffect(() => {
    const step = (now: number) => {
      rafRef.current = requestAnimationFrame(step);
      const map = mapRef.current;
      const g = (window as any).google;
      const dt = Math.min(0.1, (now - (lastFrameRef.current || now)) / 1000);
      lastFrameRef.current = now;
      if (!map || !g || !targetRef.current || !meMarker.current) return;

      // Dead reckoning: keep the car moving between fixes using the last speed
      // along the route, capped so a lost signal can't run away with it.
      let target = targetRef.current;
      const idx = pathIdxRef.current;
      const proj = projRef.current;
      const sinceFix = (now - lastFixAtRef.current) / 1000;
      if (navigatingRef.current && idx && proj && speedRef.current > 1.5 && sinceFix > 0) {
        const predicted = proj.along + speedRef.current * Math.min(sinceFix, 6);
        target = pointAtAlong(idx, predicted);
      }

      // Exponential smoothing toward the target - frame-rate independent.
      const rendered = renderedRef.current ?? target;
      const a = 1 - Math.exp(-dt / POS_TAU);
      const lat = rendered.lat + (target.lat - rendered.lat) * a;
      const lng = rendered.lng + (target.lng - rendered.lng) * a;
      renderedRef.current = { lat, lng };
      meMarker.current.setPosition({ lat, lng });
      accuracyCircle.current?.setCenter({ lat, lng });

      // Heading
      if (targetHeadingRef.current != null) {
        const d = shortestDelta(renderedHeadingRef.current, targetHeadingRef.current);
        renderedHeadingRef.current = (renderedHeadingRef.current + d * a + 360) % 360;
        if (Math.abs(shortestDelta(iconHeadingRef.current, renderedHeadingRef.current)) > 3) {
          iconHeadingRef.current = renderedHeadingRef.current;
          meMarker.current.setIcon(carIcon(g, renderedHeadingRef.current));
        }
      }

      // Camera: eased follow with a look-ahead offset while driving.
      if (followRef.current) {
        let camTarget = { lat, lng };
        if (navigatingRef.current && idx && proj && speedRef.current > 2) {
          camTarget = pointAtAlong(idx, proj.along + speedRef.current * LOOKAHEAD_S);
        }
        const cam = camRef.current ?? camTarget;
        const ca = 1 - Math.exp(-dt / CAM_TAU);
        const clat = cam.lat + (camTarget.lat - cam.lat) * ca;
        const clng = cam.lng + (camTarget.lng - cam.lng) * ca;
        camRef.current = { lat: clat, lng: clng };
        if (now - lastCamSetRef.current > 40) {
          lastCamSetRef.current = now;
          programmaticMoveRef.current = true;
          map.setCenter({ lat: clat, lng: clng });
          programmaticMoveRef.current = false;
        }
      }

      // Consume the travelled part of the route (twice a second is plenty).
      if (navigatingRef.current && idx && proj && routeLine.current && now - lastLineUpdateRef.current > 500) {
        lastLineUpdateRef.current = now;
        routeLine.current.setPath(remainingPath(idx, proj));
      }

      // Live remaining distance for the ETA readouts.
      if (idx && proj && now - lastProgressAtRef.current > 900) {
        lastProgressAtRef.current = now;
        onProgressRef.current?.({
          remainingMeters: remainingMeters(idx, proj),
          along: proj.along,
          offset: proj.offset,
        });
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full rounded-2xl bg-muted" />

      {rerouting && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center">
          <div className="animate-pulse rounded-full bg-foreground/85 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-background shadow-lg">
            Rerouting…
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={recenterOnMe}
        aria-label="Center on my location"
        title="My location"
        className={`absolute bottom-8 left-4 z-30 flex items-center gap-2 rounded-full border px-4 py-2.5 shadow-lg backdrop-blur transition ${
          followUi
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-white/95 text-foreground hover:bg-white"
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
        <span className="text-sm font-semibold">My location</span>
      </button>
    </div>
  );
}

function carIcon(g: any, heading: number | null) {
  if (heading == null) {
    return {
      path: g.maps.SymbolPath.CIRCLE,
      scale: 9,
      fillColor: "#3b82f6",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
    };
  }
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

const LIGHT_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbeafe" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#eef2f7" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
