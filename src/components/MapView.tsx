import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, onMapsAuthFailure, clearMapsAuthFailure, resetMapsLoader } from "@/lib/maps-loader";
import type { Fix } from "./StatusPanel";
import { decodePolyline } from "@/lib/geo";
import {
  buildPathIndex,
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
  /** Previewed search result / tapped place, shown as a pin before routing. */
  preview?: { lat: number; lng: number; name?: string } | null;
  /** Category results shown as tappable pins. */
  pois?: { id: string; lat: number; lng: number; name: string; address?: string }[];
  onPickPoi?: (p: { id: string; lat: number; lng: number; name: string; address?: string }) => void;
  /** Tap anywhere on the map (or on a Google POI). */
  onMapClick?: (p: { lat: number; lng: number; placeId?: string }) => void;
}


const DEFAULT_CENTER = { lat: 41.7151, lng: 44.8271 };
/** Longest tween between two real GPS fixes (ms). Google Maps behaves the same:
 *  it only ever animates between positions the device actually reported. */
const MAX_TWEEN_MS = 1200;


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
  preview,
  pois,
  onPickPoi,
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const meMarker = useRef<any>(null);
  const destMarker = useRef<any>(null);
  const previewMarker = useRef<any>(null);
  const poiMarkersRef = useRef<any[]>([]);
  const waypointMarkersRef = useRef<any[]>([]);
  const trafficLayerRef = useRef<any>(null);
  const accuracyCircle = useRef<any>(null);
  const routeLine = useRef<any>(null);
  const altLinesRef = useRef<any[]>([]);
  const lastPolylineRef = useRef<string | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onPickPoiRef = useRef(onPickPoi);
  onPickPoiRef.current = onPickPoi;


  // ---- live engine state -------------------------------------------------
  const pathIdxRef = useRef<PathIndex | null>(null);
  const projRef = useRef<Projection | null>(null);
  const tweenFromRef = useRef<{ lat: number; lng: number } | null>(null);
  const tweenToRef = useRef<{ lat: number; lng: number } | null>(null);
  const tweenStartRef = useRef<number>(0);
  const tweenMsRef = useRef<number>(600);
  const prevFixAtRef = useRef<number>(0);
  const targetHeadingRef = useRef<number | null>(null);
  const renderedRef = useRef<{ lat: number; lng: number } | null>(null);
  const renderedHeadingRef = useRef<number>(0);
  const iconHeadingRef = useRef<number>(-999);
  const camRef = useRef<{ lat: number; lng: number } | null>(null);
  const speedRef = useRef<number>(0);
  const lastFixAtRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const lastCamSetRef = useRef<number>(0);
  const lastLineUpdateRef = useRef<number>(0);
  const lastProgressAtRef = useRef<number>(0);

  const resizeObsRef = useRef<any>(null);
  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null);
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
  const [bootAttempt, setBootAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const authTimerRef = useRef<number | null>(null);
  const authRetriedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    const boot = (tries: number) => {
      loadGoogleMaps()
        .then((g) => {
          if (cancelled || !containerRef.current) return;
          if (mapRef.current) {
            setMapError(null);
            return;
          }
          mapRef.current = new g.maps.Map(containerRef.current, {
            center: DEFAULT_CENTER,
            zoom: 7,
            disableDefaultUI: true,
            zoomControl: false,
            gestureHandling: "greedy",
            clickableIcons: true,
            keyboardShortcuts: false,
            maxZoom: 20,
            minZoom: 4,
            isFractionalZoomEnabled: false,
            styles: LIGHT_STYLE,
            backgroundColor: "#f1f5f9",
          });
          clearMapsAuthFailure();
          if (authTimerRef.current != null) {
            window.clearTimeout(authTimerRef.current);
            authTimerRef.current = null;
          }
          setMapError(null);
          setRetrying(false);
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

          // Tapping the map (or a Google POI) previews that place.
          mapRef.current.addListener("click", (ev: any) => {
            const handler = onMapClickRef.current;
            if (!handler || !ev?.latLng) return;
            if (ev.placeId && typeof ev.stop === "function") ev.stop();
            handler({
              lat: ev.latLng.lat(),
              lng: ev.latLng.lng(),
              placeId: ev.placeId ?? undefined,
            });
          });

          // Remember the last settled center so a container resize can restore it.
          mapRef.current.addListener("idle", () => {
            const c = mapRef.current?.getCenter?.();
            if (c) lastCenterRef.current = { lat: c.lat(), lng: c.lng() };
          });

          // The container changes size when the side panel is hidden/shown or
          // HUD mode toggles. Google must re-measure or the map appears frozen.
          if (typeof ResizeObserver !== "undefined" && containerRef.current) {
            let raf = 0;
            resizeObsRef.current = new ResizeObserver(() => {
              if (raf) cancelAnimationFrame(raf);
              raf = requestAnimationFrame(() => {
                raf = 0;
                const map = mapRef.current;
                if (!map) return;
                const keep = followRef.current
                  ? renderedRef.current ?? lastCenterRef.current
                  : lastCenterRef.current;
                g.maps.event.trigger(map, "resize");
                if (keep) {
                  programmaticMoveRef.current = true;
                  map.setCenter(keep);
                  window.setTimeout(() => (programmaticMoveRef.current = false), 200);
                }
              });
            });
            resizeObsRef.current.observe(containerRef.current);
          }
        })


        .catch((e) => {
          if (cancelled) return;
          console.error(e);
          // Transient network/timeout failures are common in the car: retry quietly.
          if (tries < 3) {
            setRetrying(true);
            window.setTimeout(() => {
              if (!cancelled) boot(tries + 1);
            }, 1200 * (tries + 1));
            return;
          }
          setRetrying(false);
          setMapError("Map is taking longer than usual to load. Check the car's internet connection and try again.");
        });
    };

    boot(0);

    // A rejection is only real if the map still hasn't come up a moment later,
    // and it gets one silent fresh retry before the driver ever sees a banner.
    const offAuth = onMapsAuthFailure((message) => {
      if (cancelled) return;
      if (authTimerRef.current != null) window.clearTimeout(authTimerRef.current);
      setRetrying(true);
      authTimerRef.current = window.setTimeout(() => {
        authTimerRef.current = null;
        if (cancelled || mapRef.current) return;
        if (!authRetriedRef.current) {
          authRetriedRef.current = true;
          resetMapsLoader();
          boot(0);
          return;
        }
        setRetrying(false);
        setMapError(message);
      }, 2000);
    });
    return () => {
      cancelled = true;
      offAuth();
      if (authTimerRef.current != null) {
        window.clearTimeout(authTimerRef.current);
        authTimerRef.current = null;
      }
      if (resizeObsRef.current) {
        resizeObsRef.current.disconnect();
        resizeObsRef.current = null;
      }
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
        trafficLayerRef.current = null;
      }
    };

  }, [bootAttempt]);


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

  // ---- preview pin (search result / tapped place) ------------------------
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    if (!preview) {
      if (previewMarker.current) {
        previewMarker.current.setMap(null);
        previewMarker.current = null;
      }
      return;
    }
    const pos = { lat: preview.lat, lng: preview.lng };
    if (previewMarker.current) {
      previewMarker.current.setPosition(pos);
      previewMarker.current.setTitle(preview.name ?? "Selected place");
    } else {
      previewMarker.current = new g.maps.Marker({
        map,
        position: pos,
        title: preview.name ?? "Selected place",
        zIndex: 900,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
    }
    // Fit both the car and the place so the driver sees the relationship.
    const me = renderedRef.current;
    programmaticMoveRef.current = true;
    if (me) {
      const bounds = new g.maps.LatLngBounds();
      bounds.extend(me);
      bounds.extend(pos);
      map.fitBounds(bounds, 120);
    } else {
      map.panTo(pos);
      if (map.getZoom() < 14) map.setZoom(16);
    }
    followRef.current = false;
    setFollowUi(false);
    setTimeout(() => (programmaticMoveRef.current = false), 400);
  }, [preview, mapReady]);

  // ---- category result pins ----------------------------------------------
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map) return;
    for (const m of poiMarkersRef.current) m.setMap(null);
    poiMarkersRef.current = [];
    for (const p of pois ?? []) {
      const marker = new g.maps.Marker({
        map,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        zIndex: 700,
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#0f172a",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
      });
      marker.addListener("click", () => onPickPoiRef.current?.(p));
      poiMarkersRef.current.push(marker);
    }
  }, [pois, mapReady]);



  // ---- new fix -> new target --------------------------------------------
  useEffect(() => {
    const g = (window as any).google;
    const map = mapRef.current;
    if (!g || !map || !fix) return;

    const raw = { lat: fix.lat, lng: fix.lng };
    const now = performance.now();
    lastFixAtRef.current = now;
    speedRef.current = fix.speed != null && fix.speed > 0 ? fix.speed : 0;

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

    // Tween from wherever the marker is now to the reported position.
    tweenFromRef.current = renderedRef.current ?? raw;
    tweenToRef.current = raw;
    tweenStartRef.current = now;
    tweenMsRef.current = Math.min(MAX_TWEEN_MS, Math.max(250, now - (prevFixAtRef.current || now)));
    prevFixAtRef.current = now;

    // Keep route progress in sync with the reported position only.
    const idx = pathIdxRef.current;
    if (idx) {
      const proj = projectOnPath(raw, idx, projRef.current?.along, 600);
      if (proj) projRef.current = proj;
    } else {
      projRef.current = null;
    }
    if (fix.heading != null) targetHeadingRef.current = fix.heading;
  }, [fix, navigating, mapReady]);

  // ---- animation loop: tween between real fixes only ---------------------
  useEffect(() => {
    const step = (now: number) => {
      rafRef.current = requestAnimationFrame(step);
      const map = mapRef.current;
      const g = (window as any).google;
      if (!map || !g || !meMarker.current) return;

      const from = tweenFromRef.current;
      const to = tweenToRef.current;
      if (!to) return;

      const t = tweenMsRef.current > 0
        ? Math.min(1, (now - tweenStartRef.current) / tweenMsRef.current)
        : 1;
      const lat = from ? from.lat + (to.lat - from.lat) * t : to.lat;
      const lng = from ? from.lng + (to.lng - from.lng) * t : to.lng;
      renderedRef.current = { lat, lng };
      meMarker.current.setPosition({ lat, lng });
      accuracyCircle.current?.setCenter({ lat, lng });

      // Heading follows the reported course.
      const th = targetHeadingRef.current;
      if (th != null) {
        const d = shortestDelta(renderedHeadingRef.current, th);
        renderedHeadingRef.current = (renderedHeadingRef.current + d * 0.2 + 360) % 360;
        if (Math.abs(shortestDelta(iconHeadingRef.current, renderedHeadingRef.current)) > 3) {
          iconHeadingRef.current = renderedHeadingRef.current;
          meMarker.current.setIcon(carIcon(g, renderedHeadingRef.current));
        }
      }

      // Camera: plain Google follow, like the Maps app.
      if (followRef.current && now - lastCamSetRef.current > 60) {
        lastCamSetRef.current = now;
        camRef.current = { lat, lng };
        programmaticMoveRef.current = true;
        map.setCenter({ lat, lng });
        programmaticMoveRef.current = false;
      }

      const idx = pathIdxRef.current;
      const proj = projRef.current;
      // Consume the travelled part of the route.
      if (navigatingRef.current && idx && proj && routeLine.current && now - lastLineUpdateRef.current > 700) {
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

      {retrying && !mapError && (
        <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center rounded-2xl bg-background/80">
          <div className="animate-pulse text-sm font-semibold text-muted-foreground">Loading map…</div>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 z-40 grid place-items-center rounded-2xl bg-background/95 p-6 text-center">
          <div className="max-w-md">
            <h2 className="font-display text-lg font-bold text-foreground">Map didn't load</h2>
            <p className="mt-2 text-sm text-muted-foreground">{mapError}</p>
            <button
              type="button"
              onClick={() => {
                setMapError(null);
                setRetrying(true);
                authRetriedRef.current = false;
                resetMapsLoader();
                setBootAttempt((n) => n + 1);
              }}
              className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
            >
              Try again
            </button>
          </div>
        </div>
      )}



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

      {/* Large touch-friendly zoom controls */}
      <div className="absolute bottom-8 right-4 z-30 flex flex-col overflow-hidden rounded-2xl border border-border bg-white/95 shadow-lg backdrop-blur">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            programmaticMoveRef.current = true;
            map.setZoom(Math.min(20, (map.getZoom() ?? 15) + 1));
            setTimeout(() => (programmaticMoveRef.current = false), 200);
          }}
          className="h-12 w-12 text-2xl font-semibold text-foreground hover:bg-muted"
        >
          +
        </button>
        <div className="h-px bg-border" />
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            programmaticMoveRef.current = true;
            map.setZoom(Math.max(4, (map.getZoom() ?? 15) - 1));
            setTimeout(() => (programmaticMoveRef.current = false), 200);
          }}
          className="h-12 w-12 text-2xl font-semibold text-foreground hover:bg-muted"
        >
          −
        </button>
      </div>

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
  { elementType: "labels.text.fill", stylers: [{ color: "#475569" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#334155" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#fef3c7" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#fcd34d" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbeafe" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#eef2f7" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dcfce7" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "on" }] },
  { featureType: "poi.business", elementType: "labels.text", stylers: [{ visibility: "simplified" }] },

  { featureType: "transit", stylers: [{ visibility: "off" }] },
];
