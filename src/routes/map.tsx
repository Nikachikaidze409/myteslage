import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { LocationButton } from "@/components/LocationButton";
import { useLiveLocation } from "@/hooks/useLiveLocation";
import { StatusPanel, type Fix } from "@/components/StatusPanel";
import { DestinationSearch, type Destination } from "@/components/DestinationSearch";
import { RoutePreview } from "@/components/RoutePreview";
import { FeasibilityNote } from "@/components/FeasibilityNote";
import { PairPhonePanel } from "@/components/PairPhonePanel";
import { DirectionsPanel } from "@/components/DirectionsPanel";
import { NavBanner } from "@/components/NavBanner";
import { HudBottomBar } from "@/components/HudBottomBar";
import { NearbyChips } from "@/components/NearbyChips";
import { FavoritesPanel } from "@/components/FavoritesPanel";
import { AlternativesPanel } from "@/components/AlternativesPanel";
import { BatteryPanel } from "@/components/BatteryPanel";
import { distanceMeters } from "@/lib/geo";
import { computeRoute, type RouteResult, type AvoidOption } from "@/lib/routes.functions";
import {
  pushRecent,
  cacheLastRoute,
  loadCachedRoute,
  useNetworkStatus,
  loadRoutePrefs,
  saveRoutePrefs,
  type RoutePrefs,
} from "@/lib/favorites";
import { snapToRoad } from "@/lib/snap-to-road.functions";
import {
  RouteRequestController,
  routeFingerprint,
  type RoutePurpose,
} from "@/lib/maps/routeRequestController";
import { countApi } from "@/lib/maps/apiUsage";
import { isPlausibleFix, resolveHeading } from "@/lib/fix-filter";
import type { LiveProgress } from "@/components/MapView";
import { saveSession, loadSession, clearSession } from "@/lib/session";
import { AuthGate, signOutAndReturn } from "@/components/AuthGate";
import { reverseGeocode, placeDetails } from "@/lib/search.functions";
import { searchNearby, type NearbyPlace } from "@/lib/places.functions";
import { NavDebugPanel } from "@/components/NavDebugPanel";
import type { NavDebug } from "@/lib/maps/navigationEngine";


const MapView = lazy(() =>
  import("@/components/MapView").then((m) => ({ default: m.MapView })),
);

export const Route = createFileRoute("/map")({
  component: IndexGated,
});

const MAP_CATEGORIES: { key: string; label: string; emoji: string }[] = [
  { key: "supercharger", label: "Charging", emoji: "⚡" },
  { key: "gas", label: "Gas", emoji: "⛽" },
  { key: "food", label: "Food", emoji: "🍽" },
  { key: "coffee", label: "Coffee", emoji: "☕" },
  { key: "parking", label: "Parking", emoji: "🅿" },
];

function IndexGated() {
  return (
    <AuthGate>
      <Index />
    </AuthGate>
  );
}

function Index() {
  const [fix, setFixRaw] = useState<Fix | null>(null);
  // While a paired phone is streaming, it is the authoritative position source.
  const lastPhoneFixAtRef = useRef(0);
  const PHONE_FIX_TTL_MS = 9_000;
  // GpsEngine is the single navigation processor: it owns accuracy gating,
  // outlier rejection, smoothing and heading derivation. Here we only do the
  // cheap sanity check the UI itself needs.
  const setFix = useCallback((next: Fix) => {
    if (next.source === "phone") lastPhoneFixAtRef.current = Date.now();
    else if (Date.now() - lastPhoneFixAtRef.current < PHONE_FIX_TTL_MS) return;
    if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;
    if (Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180) return;
    setFixRaw(next);
  }, []);
  const [progress, setProgress] = useState<LiveProgress | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Start live tracking automatically; no tap required.
  const [watching, setWatching] = useState(true);
  // One authoritative live-location stream for the whole screen: independent of
  // the sidebar, HUD mode, 2D/3D switching and route changes.
  const live = useLiveLocation(
    useCallback(
      (f: Fix) => {
        setError(null);
        setFix(f);
      },
      [setFix],
    ),
  );



  // Surface a genuine location failure once; never loop the permission prompt.
  useEffect(() => {
    if (live.error && (live.status === "denied" || live.status === "unavailable")) {
      setError(live.error);
    }
  }, [live.error, live.status]);

  const [destination, setDestination] = useState<Destination | null>(null);
  // A tapped/searched place shown as a pin with a card, before routing starts.
  const [preview, setPreview] = useState<Destination | null>(null);
  const [pois, setPois] = useState<NearbyPlace[]>([]);
  const [poiCat, setPoiCat] = useState<string | null>(null);
  const [poiLoading, setPoiLoading] = useState(false);

  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [avoid, setAvoid] = useState<AvoidOption[]>([]);
  const [prefs, setPrefs] = useState<RoutePrefs>(() => loadRoutePrefs());
  const [waypoints, setWaypoints] = useState<{ lat: number; lng: number; name: string }[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const [showTraffic, setShowTraffic] = useState(true);
  const [tilt3d, setTilt3d] = useState(true);
  // 3D perspective needs vector (WebGL) rendering. Older in-car GPUs fall back
  // to raster: the toggle is then hidden and the map stays flat 2D.
  const [vector3dAvailable, setVector3dAvailable] = useState(true);
  const [offlineCache, setOfflineCache] = useState(false);
  const online = useNetworkStatus();

  // HUD mode: driven entirely by the phone. Tesla becomes a big display.
  const [hudMode, setHudMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);
  // Sidebar collapse so the map can fill the full screen.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Navigation telemetry: dev builds, or ?navdebug=1 on any build.
  const [navDebug, setNavDebug] = useState<{ debug: NavDebug | null; state: string } | null>(null);
  const debugEnabled =
    typeof window !== "undefined" &&
    (import.meta.env.DEV || new URLSearchParams(window.location.search).has("navdebug"));
  const debugEnabledRef = useRef(debugEnabled);
  debugEnabledRef.current = debugEnabled;


  // Session restore state
  const restoredRef = useRef(false);
  const pendingResumeRef = useRef(false);
  const [resumedName, setResumedName] = useState<string | null>(null);

  const routeCtl = useRef(new RouteRequestController());
  const lastRouteOriginRef = useRef<Fix | null>(null);
  const lastLiveRouteAtRef = useRef(0);
  const offRouteSinceRef = useRef<number | null>(null);
  const lastRerouteAtRef = useRef(0);
  const [rerouteTiming, setRerouteTiming] = useState({
    detectedAt: null as number | null,
    requestedAt: null as number | null,
    responseMs: null as number | null,
    activatedAt: null as number | null,
    totalMs: null as number | null,
    staleRejected: 0,
  });
  // Cache snapped destinations so we don't hit Roads API on every reroute.
  const snappedDestRef = useRef<{ key: string; lat: number; lng: number } | null>(null);

  const route = routes[selectedRouteIdx] ?? null;

  // Sync prefs to avoid[] and persist.
  useEffect(() => {
    saveRoutePrefs(prefs);
    const next: AvoidOption[] = [];
    if (prefs.avoidTolls) next.push("tolls");
    if (prefs.avoidHighways) next.push("highways");
    setAvoid(next);
  }, [prefs]);

  // The status card owns its own 1s clock while it is mounted, so the map
  // screen no longer re-renders every second.



  // On mount: restore last active nav session (e.g. after Tesla exited reverse and browser reopened).
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const s = loadSession();
    if (!s || !s.destination) return;
    setDestination(s.destination);
    setAvoid(s.avoid ?? []);
    setWaypoints(s.waypoints ?? []);
    if (s.navigating) {
      pendingResumeRef.current = true;
      setResumedName(s.destination.name);
      // Auto-turn on tracking; LocationButton picks this up.
      setWatching(true);
    }
  }, []);

  // Dismiss the "Resumed trip" toast after 6s.
  useEffect(() => {
    if (!resumedName) return;
    const t = window.setTimeout(() => setResumedName(null), 6000);
    return () => window.clearTimeout(t);
  }, [resumedName]);

  // Persist session whenever the active trip changes.
  useEffect(() => {
    saveSession({
      destination: destination
        ? { lat: destination.lat, lng: destination.lng, name: destination.name }
        : null,
      avoid,
      waypoints,
      navigating,
    });
  }, [destination, avoid, waypoints, navigating]);

  // Clear session on arrival (within 50m of destination).
  useEffect(() => {
    if (!destination || !fix) return;
    const d = distanceMeters(fix, destination);
    if (d < 50) {
      clearSession();
    }
  }, [fix, destination]);

  const requestRoute = useCallback(
    (
      originFix: Fix,
      nextDestination: Destination,
      options?: {
        silent?: boolean;
        reroute?: boolean;
        traffic?: boolean;
        avoid?: AvoidOption[];
        waypoints?: { lat: number; lng: number; name: string }[];
      },
    ) => {
      const purpose: RoutePurpose = options?.reroute
        ? "reroute"
        : options?.traffic
          ? "traffic"
          : "user";
      const effAvoid = options?.avoid ?? avoid;
      const effWaypoints = options?.waypoints ?? waypoints;
      const ticket = routeCtl.current.begin(
        purpose,
        routeFingerprint({
          purpose,
          origin: originFix,
          destination: nextDestination,
          waypoints: effWaypoints,
          avoid: effAvoid,
          avoidUnpaved: prefs.avoidUnpaved,
        }),
      );
      // Duplicate, or outranked by a request already running (a traffic
      // refresh can never disturb an active reroute).
      if (!ticket) return;

      const requestId = ticket.id;
      const startedAt = Date.now();
      if (!options?.silent) setRouteLoading(true);
      setRouteError(null);
      // Snap destination to nearest drivable road so we don't route down a dirt path
      // to reach a Place pin sitting on a field / back-lot.
      const destKey = `${nextDestination.lat.toFixed(5)},${nextDestination.lng.toFixed(5)}`;
      const snapPromise: Promise<{ lat: number; lng: number }> =
        snappedDestRef.current?.key === destKey
          ? Promise.resolve({ lat: snappedDestRef.current.lat, lng: snappedDestRef.current.lng })
          : // A reroute or a traffic refresh must not wait on an extra Roads round trip.
            purpose !== "user"
            ? Promise.resolve({ lat: nextDestination.lat, lng: nextDestination.lng })
            : snapToRoad({ data: { lat: nextDestination.lat, lng: nextDestination.lng } })
              .then((s) => {
                snappedDestRef.current = { key: destKey, lat: s.lat, lng: s.lng };
                return { lat: s.lat, lng: s.lng };
              })
              .catch(() => ({ lat: nextDestination.lat, lng: nextDestination.lng }));

      snapPromise
        .then((snappedDest) =>
          computeRoute({
            data: {
              origin: { lat: originFix.lat, lng: originFix.lng },
              destination: snappedDest,
              purpose,
              alternatives: purpose === "user",
              avoid: effAvoid,
              avoidUnpaved: prefs.avoidUnpaved ? true : undefined,
              waypoints: effWaypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
            },
            signal: ticket.signal,
          }),

        )
        .then((resp) => {
          if (!routeCtl.current.isCurrent(requestId)) {
            countApi("route.stale");
            if (debugEnabledRef.current)
              setRerouteTiming((t) => ({ ...t, staleRejected: t.staleRejected + 1 }));
            return;
          }
           if (debugEnabledRef.current) {
             console.debug(
               `[nav] route ${purpose} #${requestId} answered in ${Date.now() - startedAt} ms`,
             );
           }
           setRoutes(resp.routes);
           setSelectedRouteIdx(0);
           lastLiveRouteAtRef.current = Date.now();
           if (options?.reroute) {
             setRerouting(false);
             if (debugEnabledRef.current) {
               const now = Date.now();
               setRerouteTiming((t) => ({
                 ...t,
                 responseMs: now - startedAt,
                 activatedAt: now,
                 totalMs: t.detectedAt ? now - t.detectedAt : null,
               }));
             }
           }
          lastRouteOriginRef.current = originFix;
          setOffRoute(false);
          offRouteSinceRef.current = null;
          setOfflineCache(false);
          const primary = resp.routes[0];
          if (primary) {
            cacheLastRoute({
              destination: {
                lat: nextDestination.lat,
                lng: nextDestination.lng,
                name: nextDestination.name,
              },
              encodedPolyline: primary.encodedPolyline,
              distanceMeters: primary.distanceMeters,
              durationSeconds: primary.durationSeconds,
              savedAt: Date.now(),
            });
          }
          setNavigating(true);
        })
        .catch((e: unknown) => {
          if (!routeCtl.current.isCurrent(requestId)) return;
           setRouteError(e instanceof Error ? e.message : "Route failed");
           // A failed reroute must never leave the screen stuck on "Rerouting".
           if (options?.reroute) setRerouting(false);
           const cached = loadCachedRoute();
          if (
            cached &&
            Math.abs(cached.destination.lat - nextDestination.lat) < 1e-4 &&
            Math.abs(cached.destination.lng - nextDestination.lng) < 1e-4
          ) {
            setRoutes([
              {
                distanceMeters: cached.distanceMeters,
                durationSeconds: cached.durationSeconds,
                encodedPolyline: cached.encodedPolyline,
                steps: [],
                label: "Cached",
              },
            ]);
            setSelectedRouteIdx(0);
            setOfflineCache(true);
          }
        })
        .finally(() => {
          const current = routeCtl.current.isCurrent(requestId);
          routeCtl.current.finish(requestId);
          if (current && !options?.silent) setRouteLoading(false);
        });
    },
    [avoid, waypoints, prefs.avoidUnpaved],
  );

  // New destination selected
  useEffect(() => {
    // In HUD mode the phone owns routing - do not recompute on Tesla.
    if (hudMode) return;
    setRoutes([]);
    setSelectedRouteIdx(0);
    setProgress(null);
    setRerouting(false);
    // Preserve waypoints when a session restore just seeded them.
    if (!pendingResumeRef.current) setWaypoints([]);
    setNavigating(false);
    setOffRoute(false);
    lastRouteOriginRef.current = null;
    if (!destination) {
      setRouteError(null);
      return;
    }
    if (!fix) {
      setRouteError("Waiting for a live location fix from the Tesla browser or paired phone.");
      return;
    }
    pushRecent({ lat: destination.lat, lng: destination.lng, name: destination.name });
    requestRoute(fix, destination);
    if (pendingResumeRef.current) pendingResumeRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination]);

  // Avoid options or waypoints changed → re-request silently
  useEffect(() => {
    if (hudMode) return;
    if (!destination || !fix) return;
    requestRoute(fix, destination, { silent: true, avoid, waypoints });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avoid, waypoints, prefs.avoidUnpaved]);

  useEffect(() => {
    if (hudMode) return;
    if (!destination || !fix || route || routeLoading) return;
    requestRoute(fix, destination);
  }, [destination, fix, route, routeLoading, requestRoute]);

  // The map engine owns off-route detection (it matches against the real
  // route geometry every frame and calls onRerouteNeeded). This effect only
  // handles the occasional traffic-aware refresh of a route we are still on.
  // Deliberately conservative: refreshing every few seconds burned Routes API
  // quota without changing the driver's road.
  useEffect(() => {
    if (hudMode) return;
    if (!navigating || !destination || !fix || routeLoading) return;
    if (rerouting || routeCtl.current.busy) return;
    const lastRouteOrigin = lastRouteOriginRef.current;
    if (!lastRouteOrigin) return;
    // Close to the destination the ETA no longer moves: stop paying for it.
    if (distanceMeters(fix, destination) < 3_000) return;

    const moved = distanceMeters(fix, lastRouteOrigin);
    const elapsed = Date.now() - lastLiveRouteAtRef.current;
    if (moved >= 2_000 && elapsed >= 240_000) {
      lastLiveRouteAtRef.current = Date.now();
      requestRoute(fix, destination, { silent: true, traffic: true });
    }
  }, [destination, fix, hudMode, navigating, rerouting, requestRoute, routeLoading]);

  // Safety net: never leave the driver looking at "Rerouting" forever.
  useEffect(() => {
    if (!rerouting) return;
    const t = window.setTimeout(() => setRerouting(false), 20_000);
    return () => window.clearTimeout(t);
  }, [rerouting]);

  // Leaving the map screen must not leave a request running.
  useEffect(() => {
    const ctl = routeCtl.current;
    return () => ctl.cancelAll();
  }, []);

  const handleRerouteNeeded = useCallback(() => {
    // HUD mode: the phone is the only routing brain. Tesla never routes.
    if (hudMode) return;
    if (!navigating || !destination || !fix) return;
    // The engine already debounces; this only stops duplicate calls in-flight.
    if (Date.now() - lastRerouteAtRef.current < 1_200) return;
    const detectedAt = Date.now();
    lastRerouteAtRef.current = detectedAt;
    offRouteSinceRef.current = detectedAt;
    if (debugEnabledRef.current)
      setRerouteTiming((t) => ({
        ...t,
        detectedAt,
        requestedAt: detectedAt,
        responseMs: null,
        activatedAt: null,
        totalMs: null,
      }));
    if (debugEnabledRef.current) console.debug("[nav] off-route confirmed → requesting new route");
    setOffRoute(true);
    setRerouting(true);
    requestRoute(fix, destination, { silent: true, reroute: true });
  }, [destination, fix, hudMode, navigating, requestRoute]);

  useEffect(() => {
    if (!rerouting && offRoute) setOffRoute(false);
  }, [rerouting, offRoute]);


  const stopNav = () => {
    setNavigating(false);
    setProgress(null);
    setRerouting(false);
    setWaypoints([]);
    setDestination(null);
    clearSession();
  };

  // Tapping the map (or a Google POI) previews that spot with its address.
  const handleMapClick = useCallback(
    (p: { lat: number; lng: number; placeId?: string }) => {
      if (navigating || hudMode) return;
      setPreview({ lat: p.lat, lng: p.lng, name: "Loading…" });
      const load = p.placeId
        ? placeDetails({ data: { placeId: p.placeId } }).then((d) => ({
            lat: d.lat,
            lng: d.lng,
            name: d.name,
            address: d.address,
          }))
        : reverseGeocode({ data: { lat: p.lat, lng: p.lng } }).then((r) => ({
            lat: p.lat,
            lng: p.lng,
            name: r.name,
            address: r.address,
          }));
      load
        .then(setPreview)
        .catch(() => setPreview({ lat: p.lat, lng: p.lng, name: "Dropped pin" }));
    },
    [navigating, hudMode],
  );

  const runCategory = useCallback(
    (cat: string) => {
      if (!fix) return;
      if (poiCat === cat) {
        setPoiCat(null);
        setPois([]);
        return;
      }
      setPoiCat(cat);
      setPoiLoading(true);
      searchNearby({ data: { lat: fix.lat, lng: fix.lng, category: cat } })
        .then((r) => setPois(r.places.slice(0, 12)))
        .catch(() => setPois([]))
        .finally(() => setPoiLoading(false));
    },
    [fix, poiCat],
  );

  const startTo = (d: Destination) => {
    setPreview(null);
    setPois([]);
    setPoiCat(null);
    setDestination(d);
  };



  // Called by PairPhonePanel when the phone broadcasts a full NavState.
  // In HUD mode we bypass Tesla-side route computation entirely.
  const applyPairedNav = useCallback((n: import("@/lib/pair-channel").PairedNavState) => {
    if (!n.destination || !n.encodedPolyline) {
      // Phone cancelled the trip.
      setHudMode(false);
      setNavigating(false);
      setDestination(null);
      setRoutes([]);
      setRerouting(false);
      return;
    }
    setHudMode(true);
    setDestination({ lat: n.destination.lat, lng: n.destination.lng, name: n.destination.name });
    setRoutes([{
      distanceMeters: n.distanceMeters,
      durationSeconds: n.durationSeconds,
      encodedPolyline: n.encodedPolyline,
      steps: n.steps,
      label: "From phone",
    }]);
    setSelectedRouteIdx(0);
    setNavigating(true);
    setRouteError(null);
    // Mirror the phone brain's rerouting state; cleared when the new route
    // arrives with isRerouting=false.
    setRerouting(!!n.isRerouting);
  }, []);

  const addWaypoint = (stop: { lat: number; lng: number; name: string }) => {
    setWaypoints((cur) => [...cur, stop]);
  };

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className={`mx-auto flex h-full w-full ${hudMode ? "max-w-none p-0" : "max-w-[1600px] gap-3 p-3"}`}>
        {/* Sidebar - hidden in HUD mode (phone is the brain) or when minimized */}
        {!hudMode && (
        <aside
          className={`${sidebarOpen ? "flex" : "hidden"} w-[340px] shrink-0 flex-col gap-3 overflow-y-auto rounded-3xl border border-border bg-card/60 p-3`}
        >
          <header className="px-2 pt-2">
            <div className="font-display text-[11px] font-bold uppercase tracking-widest text-primary">
              Tesla · Georgia
            </div>
            <div className="flex items-center justify-between gap-2">
              <h1 className="font-display mt-1 text-xl font-bold leading-tight text-foreground">
                Browser navigation
              </h1>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void signOutAndReturn()}
                  className="rounded-lg border border-border bg-white px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Hide panel"
                  title="Hide panel"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-white text-lg font-bold leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            </div>
            {!online && (
              <div className="mt-2 rounded-lg border border-[color:var(--bad)]/30 bg-[color:var(--bad)]/5 px-2 py-1 text-[11px] font-semibold text-[color:var(--bad)]">
                Offline - using cached route
              </div>
            )}
          </header>

          {routes.length > 1 && (
            <AlternativesPanel
              routes={routes}
              selectedIndex={selectedRouteIdx}
              onSelect={setSelectedRouteIdx}
              prefs={prefs}
              onPrefsChange={setPrefs}
            />
          )}

          <FavoritesPanel currentDestination={destination} onPick={setDestination} />

          <LocationButton
            status={live.status}
            onStart={live.start}
            onStop={live.stop}
          />

          <PairPhonePanel
            onPairedFix={(p) => {
              setError(null);
              setWatching(true);
              setFix({
                lat: p.lat,
                lng: p.lng,
                accuracy: p.accuracy,
                heading: p.heading,
                speed: p.speed,
                timestamp: p.timestamp,
                source: "phone",
              });
            }}
            onPairedNav={applyPairedNav}
          />

          {error && (
            <div className="rounded-2xl border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/5 p-4">
              <div className="text-sm font-semibold text-[color:var(--bad)]">
                Live location needs attention
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error} Pair your phone above if the Tesla browser stops updating while driving.
              </p>
            </div>
          )}

          {fix && <StatusPanel fix={fix} now={now} />}

          <NearbyChips origin={fix} onPick={setDestination} />

          {route && (
            <BatteryPanel
              routeKm={route.distanceMeters / 1000}
              encodedPolyline={route.encodedPolyline}
              onAddStop={addWaypoint}
            />
          )}

          {route && <DirectionsPanel route={route} fix={fix} />}

          <div className="mt-auto flex flex-col gap-3">
            <RoutePreview
              route={route}
              destinationName={destination?.name ?? null}
              loading={routeLoading}
              error={routeError}
              offRoute={offRoute}
              offline={offlineCache}
            />
            <FeasibilityNote />
          </div>
        </aside>
        )}

        {/* Hidden PairPhonePanel in HUD mode - still needs to be mounted to receive nav broadcasts. */}
        {hudMode && (
          <div className="hidden">
            <PairPhonePanel
              onPairedFix={(p) => {
                setError(null);
                setWatching(true);
                setFix({
                  lat: p.lat,
                  lng: p.lng,
                  accuracy: p.accuracy,
                  heading: p.heading,
                  speed: p.speed,
                  timestamp: p.timestamp,
                  source: "phone",
                });
              }}
              onPairedNav={applyPairedNav}
            />
          </div>
        )}

        {/* Map */}
        <main className={`relative min-h-[400px] flex-1 overflow-hidden bg-muted shadow-xl shadow-slate-300/30 lg:min-h-full ${hudMode ? "" : "rounded-3xl border border-border"}`}>
          {!hudMode && !sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Show panel"
              title="Show panel"
              className="absolute left-4 top-4 z-40 flex items-center gap-2 rounded-full border border-border bg-white/95 px-4 py-2 text-sm font-semibold text-foreground shadow-lg backdrop-blur hover:bg-white"
            >
              <span className="text-lg leading-none">☰</span>
              Panel
            </button>
          )}
          {!navigating && !hudMode && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-3 p-6">
              <div className="pointer-events-auto w-full max-w-2xl">
                <DestinationSearch onSelect={setPreview} origin={fix} />
              </div>
              <div className="pointer-events-auto flex max-w-full flex-wrap justify-center gap-2">
                {MAP_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => runCategory(c.key)}
                    disabled={!fix}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-md backdrop-blur transition disabled:opacity-40 ${
                      poiCat === c.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-white/90 text-foreground hover:bg-white"
                    }`}
                  >
                    <span className="mr-1">{c.emoji}</span>
                    {c.label}
                  </button>
                ))}
                {poiLoading && (
                  <span className="self-center rounded-full bg-white/90 px-3 py-1 text-xs text-muted-foreground shadow">
                    Searching…
                  </span>
                )}
              </div>
            </div>
          )}

          {preview && !navigating && !hudMode && (
            <div className="pointer-events-auto absolute inset-x-0 bottom-6 z-40 flex justify-center px-4">
              <div className="w-full max-w-xl rounded-3xl border border-border bg-white/97 p-5 shadow-2xl backdrop-blur">
                <div className="font-display truncate text-xl font-bold text-foreground">
                  {preview.name}
                </div>
                {preview.address && (
                  <div className="mt-0.5 truncate text-sm text-muted-foreground">{preview.address}</div>
                )}
                {fix && (
                  <div className="mt-1 text-sm font-semibold text-primary">
                    {(distanceMeters(fix, preview) / 1000).toFixed(1)} km away
                  </div>
                )}
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => startTo(preview)}
                    className="flex-1 rounded-2xl bg-primary px-5 py-3 text-base font-bold text-primary-foreground shadow-lg"
                  >
                    Directions
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="rounded-2xl border border-border px-5 py-3 text-base font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}



          {!hudMode && (
          <div className="absolute right-4 top-4 z-30">
            <button
              type="button"
              onClick={() => setShowTraffic((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-md backdrop-blur transition ${
                showTraffic
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-white/90 text-foreground hover:bg-white"
              }`}
            >
              {showTraffic ? "Traffic on" : "Traffic off"}
            </button>
            <button
              type="button"
              disabled={!vector3dAvailable}
              onClick={() => vector3dAvailable && setTilt3d((v) => !v)}
              aria-label="Toggle 3D or 2D map view"
              title={vector3dAvailable ? "Switch between 3D and 2D" : "3D view is not supported on this screen"}
              className={`mt-2 w-full rounded-full border px-3 py-1.5 text-xs font-semibold shadow-md backdrop-blur transition ${
                !vector3dAvailable
                  ? "cursor-not-allowed border-border bg-white/70 text-muted-foreground"
                  : tilt3d
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-white/90 text-foreground hover:bg-white"
              }`}
            >
              {tilt3d && vector3dAvailable ? "3D" : "2D"}
            </button>

          </div>
          )}

          {navigating && route && (
            <NavBanner
              route={route}
              fix={fix}
              onStop={stopNav}
              liveRemainingMeters={progress?.remainingMeters}
              alongMeters={progress?.along}

            />
          )}

          {hudMode && rerouting && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2">
              <div className="flex items-center gap-2 rounded-full border border-border bg-white/95 px-4 py-1.5 text-sm font-medium text-foreground shadow-lg backdrop-blur">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
                Rerouting…
              </div>
            </div>
          )}

          {hudMode && route && (
            <HudBottomBar
              route={route}
              fix={fix}
              onCancel={() => {
                // Cancel locally; the phone will re-broadcast if it's still navigating.
                setHudMode(false);
                setNavigating(false);
                setDestination(null);
                setRoutes([]);
              }}
              onRecenter={() => setRecenterSignal((n) => n + 1)}
              liveRemainingMeters={progress?.remainingMeters}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
            />
          )}

          {resumedName && (
            <div className="pointer-events-auto absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
              <div className="flex items-center gap-3 rounded-full border border-border bg-white/95 px-4 py-2 text-sm shadow-lg backdrop-blur">
                <span className="text-lg" aria-hidden>↻</span>
                <span className="font-medium text-foreground">
                  Resumed trip to <span className="font-semibold">{resumedName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setResumedName(null);
                    setDestination(null);
                    setNavigating(false);
                    setWaypoints([]);
                    clearSession();
                  }}
                  className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <ClientOnly
            fallback={
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Loading map…
              </div>
            }
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Loading map…
                </div>
              }
            >
              <MapView
                fix={fix}
                destination={destination}
                encodedPolyline={route?.encodedPolyline ?? null}
                steps={route?.steps ?? []}
                navigating={navigating}
                tilt3d={tilt3d && vector3dAvailable}
                onCapabilities={({ vector }) => {
                  // Only a hard "no vector renderer" answer disables 3D; an
                  // undetermined result leaves the control fully usable.
                  setVector3dAvailable(vector);
                  if (!vector) setTilt3d(false);
                }}
                onTilt3dUnsupported={() => {
                  // The renderer genuinely refused the pitch (verified twice):
                  // fall back to flat 2D, keep the control visible but inert.
                  setVector3dAvailable(false);
                  setTilt3d(false);
                }}

                rerouting={rerouting}
                showTraffic={showTraffic}
                onProgress={setProgress}
                onRerouteNeeded={handleRerouteNeeded}
                waypoints={waypoints}
                alternates={routes.map((r, i) => ({ encodedPolyline: r.encodedPolyline, index: i }))}
                onSelectAlternate={setSelectedRouteIdx}
                recenterSignal={recenterSignal}
                preview={preview}
                pois={pois}
                onPickPoi={(p) =>
                  setPreview({ lat: p.lat, lng: p.lng, name: p.name, address: p.address })
                }
                onMapClick={handleMapClick}
                onDebug={
                  debugEnabled ? (debug, state) => setNavDebug({ debug, state }) : undefined
                }
              />
              {debugEnabled && navDebug ? (
                <NavDebugPanel debug={navDebug.debug} state={navDebug.state} timing={rerouteTiming} />
              ) : null}

            </Suspense>
          </ClientOnly>
        </main>
      </div>
    </div>
  );
}