import { useCallback, useEffect, useRef, useState } from "react";
import { onMapsAuthFailure, clearMapsAuthFailure, resetMapsLoader } from "@/lib/maps-loader";
import { createMap } from "@/lib/maps/googleMapsService";
import { NavigationEngine, type NavDebug, type NavSnapshot } from "@/lib/maps/navigationEngine";
import type { RouteStep } from "@/lib/routes.functions";
import type { Fix } from "./StatusPanel";

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
  /** Turn-by-turn steps of the active route, used for maneuver awareness. */
  steps?: RouteStep[];
  navigating?: boolean;
  showTraffic?: boolean;
  rerouting?: boolean;
  waypoints?: { lat: number; lng: number; name?: string }[];
  alternates?: { encodedPolyline: string; index: number }[];
  onSelectAlternate?: (index: number) => void;
  onProgress?: (p: LiveProgress) => void;
  /** Development-only navigation telemetry. */
  onDebug?: (d: NavDebug | null, state: string) => void;
  /** The engine confirmed the car left the route: ask the server for a new one. */
  onRerouteNeeded?: () => void;
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

export function MapView({
  fix,
  destination,
  encodedPolyline,
  steps,
  navigating,
  showTraffic,
  rerouting,
  waypoints,
  alternates,
  onSelectAlternate,
  onProgress,
  onDebug,
  onRerouteNeeded,
  recenterSignal,
  preview,
  pois,
  onPickPoi,
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const googleRef = useRef<any>(null);
  const engineRef = useRef<NavigationEngine | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [followUi, setFollowUi] = useState(false);
  const [weakSignal, setWeakSignal] = useState(false);

  const destMarker = useRef<any>(null);
  const previewMarker = useRef<any>(null);
  const poiMarkersRef = useRef<any[]>([]);
  const waypointMarkersRef = useRef<any[]>([]);
  const trafficLayerRef = useRef<any>(null);
  const resizeObsRef = useRef<any>(null);
  const lastCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const programmaticRef = useRef(false);

  // Callback refs: the engine and map listeners must never capture stale props.
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onPickPoiRef = useRef(onPickPoi);
  onPickPoiRef.current = onPickPoi;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onDebugRef = useRef(onDebug);
  onDebugRef.current = onDebug;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const onRerouteRef = useRef(onRerouteNeeded);
  onRerouteRef.current = onRerouteNeeded;
  const onSelectAlternateRef = useRef(onSelectAlternate);
  onSelectAlternateRef.current = onSelectAlternate;

  const recenterOnMe = useCallback(() => {
    engineRef.current?.recenter();
  }, []);

  // ---- map bootstrap -----------------------------------------------------
  const [bootAttempt, setBootAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const authTimerRef = useRef<number | null>(null);
  const authRetriedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const boot = (tries: number) => {
      if (!containerRef.current) return;
      createMap(containerRef.current)
        .then(({ google, map, vector }) => {
          if (cancelled) {
            return;
          }
          googleRef.current = google;
          mapRef.current = map;
          clearMapsAuthFailure();
          if (authTimerRef.current != null) {
            window.clearTimeout(authTimerRef.current);
            authTimerRef.current = null;
          }
          setMapError(null);
          setRetrying(false);

          const engine = new NavigationEngine(map, google, vector);
          engineRef.current = engine;
          engine.onFollowChange = (v) => setFollowUi(v);
          engine.onRerouteNeeded = () => onRerouteRef.current?.();
          engine.subscribe((s: NavSnapshot) => {
            setWeakSignal(s.weakSignal);
            onProgressRef.current?.({
              remainingMeters: s.remainingMeters,
              along: s.along,
              offset: s.offset,
            });
            onDebugRef.current?.(s.debug, s.state);
          });

          // Any user gesture hands control back to the driver.
          map.addListener("dragstart", () => {
            if (programmaticRef.current) return;
            engine.releaseFollow();
          });

          map.addListener("click", (ev: any) => {
            const handler = onMapClickRef.current;
            if (!handler || !ev?.latLng) return;
            if (ev.placeId && typeof ev.stop === "function") ev.stop();
            handler({
              lat: ev.latLng.lat(),
              lng: ev.latLng.lng(),
              placeId: ev.placeId ?? undefined,
            });
          });

          map.addListener("idle", () => {
            const c = map.getCenter?.();
            if (c) lastCenterRef.current = { lat: c.lat(), lng: c.lng() };
          });

          // The container resizes when the side panel is hidden or HUD mode
          // toggles: Google must re-measure or the map appears frozen.
          if (typeof ResizeObserver !== "undefined" && containerRef.current) {
            let raf = 0;
            resizeObsRef.current = new ResizeObserver(() => {
              if (raf) cancelAnimationFrame(raf);
              raf = requestAnimationFrame(() => {
                raf = 0;
                const keep = engine.follow
                  ? engine.currentPosition() ?? lastCenterRef.current
                  : lastCenterRef.current;
                google.maps.event.trigger(map, "resize");
                engine.suppressCamera(400);
                if (keep) {
                  programmaticRef.current = true;
                  map.setCenter(keep);
                  window.setTimeout(() => (programmaticRef.current = false), 200);
                }
              });
            });
            resizeObsRef.current.observe(containerRef.current);
          }

          setMapReady(true);
        })
        .catch((e) => {
          if (cancelled) return;
          console.error(e);
          if (tries < 3) {
            setRetrying(true);
            window.setTimeout(() => {
              if (!cancelled) boot(tries + 1);
            }, 1200 * (tries + 1));
            return;
          }
          setRetrying(false);
          setMapError(
            "Map is taking longer than usual to load. Check the car's internet connection and try again.",
          );
        });
    };

    boot(0);

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
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
      trafficLayerRef.current?.setMap(null);
      trafficLayerRef.current = null;
      engineRef.current?.destroy();
      engineRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
  }, [bootAttempt]);

  // ---- engine inputs -----------------------------------------------------
  useEffect(() => {
    if (!fix) return;
    engineRef.current?.pushFix({
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      heading: fix.heading,
      speed: fix.speed,
      timestamp: fix.timestamp,
    });
  }, [fix, mapReady]);

  useEffect(() => {
    engineRef.current?.setRoute(encodedPolyline ?? null, stepsRef.current ?? []);
  }, [encodedPolyline, mapReady]);

  useEffect(() => {
    engineRef.current?.setNavigating(!!navigating);
  }, [navigating, mapReady]);

  useEffect(() => {
    if (!rerouting) engineRef.current?.rerouteResolved();
  }, [rerouting]);

  useEffect(() => {
    if (recenterSignal == null) return;
    recenterOnMe();
  }, [recenterSignal, recenterOnMe]);

  // ---- traffic overlay ---------------------------------------------------
  useEffect(() => {
    const g = googleRef.current;
    const map = mapRef.current;
    if (!g || !map) return;
    if (showTraffic) {
      if (!trafficLayerRef.current) trafficLayerRef.current = new g.maps.TrafficLayer();
      trafficLayerRef.current.setMap(map);
    } else {
      trafficLayerRef.current?.setMap(null);
    }
  }, [showTraffic, mapReady]);

  // ---- alternates --------------------------------------------------------
  useEffect(() => {
    if (!mapReady) return;
    engineRef.current?.route.setAlternates(alternates ?? [], (i) =>
      onSelectAlternateRef.current?.(i),
    );
  }, [alternates, encodedPolyline, mapReady]);

  // ---- waypoints ---------------------------------------------------------
  useEffect(() => {
    const g = googleRef.current;
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

  // ---- destination marker ------------------------------------------------
  useEffect(() => {
    const g = googleRef.current;
    const map = mapRef.current;
    if (!g || !map) return;
    if (!destination) {
      destMarker.current?.setMap(null);
      destMarker.current = null;
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
    const g = googleRef.current;
    const map = mapRef.current;
    const engine = engineRef.current;
    if (!g || !map || !engine) return;
    if (!preview) {
      previewMarker.current?.setMap(null);
      previewMarker.current = null;
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
    // Show the car and the place together so the driver sees the relationship.
    const me = engine.currentPosition();
    engine.releaseFollow();
    engine.suppressCamera(800);
    programmaticRef.current = true;
    if (me) {
      const bounds = new g.maps.LatLngBounds();
      bounds.extend(me);
      bounds.extend(pos);
      map.fitBounds(bounds, 120);
    } else {
      map.panTo(pos);
      if ((map.getZoom?.() ?? 0) < 14) map.setZoom(16);
    }
    window.setTimeout(() => (programmaticRef.current = false), 400);
  }, [preview, mapReady]);

  // ---- category result pins ----------------------------------------------
  useEffect(() => {
    const g = googleRef.current;
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

      {(rerouting || weakSignal) && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center">
          <div className="animate-pulse rounded-full bg-foreground/85 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-background shadow-lg">
            {rerouting ? "Rerouting…" : "Weak GPS signal"}
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
            engineRef.current?.suppressCamera(600);
            map.setZoom(Math.min(20, (map.getZoom() ?? 15) + 1));
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
            engineRef.current?.suppressCamera(600);
            map.setZoom(Math.max(4, (map.getZoom() ?? 15) - 1));
          }}
          className="h-12 w-12 text-2xl font-semibold text-foreground hover:bg-muted"
        >
          −
        </button>
      </div>
    </div>
  );
}
