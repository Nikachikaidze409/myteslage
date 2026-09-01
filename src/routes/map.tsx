import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { LocationButton } from "@/components/LocationButton";
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
import { PlaceSheet } from "@/components/PlaceSheet";
import { MapControls } from "@/components/MapControls";
import { distanceMeters } from "@/lib/geo";
import { distanceToPolylineMeters } from "@/lib/off-route";
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
import { isPlausibleFix, resolveHeading } from "@/lib/fix-filter";
import type { LiveProgress } from "@/components/MapView";
import { saveSession, loadSession, clearSession } from "@/lib/session";
import { AuthGate, signOutAndReturn } from "@/components/AuthGate";
import { reverseGeocode, placeDetails } from "@/lib/search.functions";
import { searchNearby, type NearbyPlace } from "@/lib/places.functions";


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
  const prevFixRef = useRef<Fix | null>(null);
  // Discard impossible jumps / junk accuracy and derive heading from motion.
  const setFix = useCallback((next: Fix) => {
    const prev = prevFixRef.current;
    if (!isPlausibleFix(prev, next)) return;
    const heading = resolveHeading(prev, next) ?? next.heading ?? null;
    const cleaned: Fix = { ...next, heading };
    prevFixRef.current = cleaned;
    setFixRaw(cleaned);
  }, []);
  const [progress, setProgress] = useState<LiveProgress | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Start live tracking automatically; no tap required.
  const [watching, setWatching] = useState(true);
  const [now, setNow] = useState(() => Date.now());

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
  const [mapType, setMapType] = useState<"roadmap" | "satellite" | "terrain">("roadmap");
  const [offlineCache, setOfflineCache] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const online = useNetworkStatus();

  // HUD mode: driven entirely by the phone. Tesla becomes a big display.
  const [hudMode, setHudMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const [recenterSignal, setRecenterSignal] = useState(0);

  // Session restore state
  const restoredRef = useRef(false);
  const pendingResumeRef = useRef(false);
  const [resumedName, setResumedName] = useState<string | null>(null);

  const routeRequestRef = useRef(0);
  const lastRouteOriginRef = useRef<Fix | null>(null);
  const lastLiveRouteAtRef = useRef(0);
  const offRouteSinceRef = useRef<number | null>(null);
  const lastRerouteAtRef = useRef(0);
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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
        avoid?: AvoidOption[];
        waypoints?: { lat: number; lng: number; name: string }[];
      },
    ) => {
      const requestId = ++routeRequestRef.current;
      if (!options?.silent) setRouteLoading(true);
      setRouteError(null);
      // Snap destination to nearest drivable road so we don't route down a dirt path
      // to reach a Place pin sitting on a field / back-lot.
      const destKey = `${nextDestination.lat.toFixed(5)},${nextDestination.lng.toFixed(5)}`;
      const snapPromise: Promise<{ lat: number; lng: number }> =
        snappedDestRef.current?.key === destKey
          ? Promise.resolve({ lat: snappedDestRef.current.lat, lng: snappedDestRef.current.lng })
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
              alternatives: true,
              avoid: options?.avoid ?? avoid,
              avoidUnpaved: prefs.avoidUnpaved ? true : undefined,
              waypoints: (options?.waypoints ?? waypoints).map((w) => ({ lat: w.lat, lng: w.lng })),
            },
          }),
        )
        .then((resp) => {
          if (routeRequestRef.current !== requestId) return;
           setRoutes(resp.routes);
           setSelectedRouteIdx(0);
           if (options?.reroute) setRerouting(false);
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
          if (routeRequestRef.current !== requestId) return;
           setRouteError(e instanceof Error ? e.message : "Route failed");
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
          if (routeRequestRef.current === requestId && !options?.silent) setRouteLoading(false);
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

  // Live progress + off-route detection + periodic traffic-aware refresh.
  // The map performs local projection every frame; this effect only decides
  // when the server should build a genuinely new route.
  useEffect(() => {
    if (hudMode) return;
    if (!navigating || !destination || !fix || routeLoading) return;
    const lastRouteOrigin = lastRouteOriginRef.current;
    if (!lastRouteOrigin) return;

    if (route?.encodedPolyline) {
      const d = distanceToPolylineMeters({ lat: fix.lat, lng: fix.lng }, route.encodedPolyline);
      if (d > 35) {
        if (offRouteSinceRef.current == null) offRouteSinceRef.current = Date.now();
        // A short confirmation filters GPS noise without making a wrong turn
        // feel delayed. The request uses the newest fix as its origin.
        if (
          Date.now() - (offRouteSinceRef.current ?? 0) > 700 &&
          Date.now() - lastRerouteAtRef.current > 2_500
        ) {
          setOffRoute(true);
          setRerouting(true);
          lastRerouteAtRef.current = Date.now();
          requestRoute(fix, destination, { silent: true, reroute: true });
          return;
        }
      } else {
        offRouteSinceRef.current = null;
        if (offRoute) setOffRoute(false);
      }
    }

    const moved = distanceMeters(fix, lastRouteOrigin);
    const elapsed = Date.now() - lastLiveRouteAtRef.current;
    if (moved >= 120 && elapsed >= 15_000) {
      lastLiveRouteAtRef.current = Date.now();
      requestRoute(fix, destination, { silent: true });
    }
  }, [destination, fix, navigating, requestRoute, routeLoading, route, offRoute]);

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
  }, []);

  const addWaypoint = (stop: { lat: number; lng: number; name: string }) => {
    setWaypoints((cur) => [...cur, stop]);
  };

  return (
    <div className="h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className={`relative mx-auto flex h-full w-full ${hudMode ? "max-w-none" : "max-w-[1800px] p-2 sm:p-3"}`}>
        {!hudMode && (
          <aside className={`absolute left-3 top-3 z-50 flex max-h-[calc(100%-1.5rem)] w-[min(380px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[1.35rem] border border-border bg-card/95 shadow-2xl shadow-foreground/15 backdrop-blur-xl transition-all duration-200 lg:static lg:max-h-full lg:w-[380px] lg:shrink-0 lg:rounded-[1.35rem] ${toolsOpen ? "" : "-translate-x-[calc(100%+1rem)] lg:translate-x-0"}`}>
            <header className="shrink-0 border-b border-border px-5 pb-4 pt-5">
              <div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Tesla Map Georgia</p><h1 className="mt-1 truncate font-display text-2xl font-bold text-card-foreground">Where to next?</h1></div><button type="button" onClick={() => void signOutAndReturn()} className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">Sign out</button></div>
              {!online && <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">Offline · cached route available</div>}
            </header>
            <div className="shrink-0 p-4 pb-2"><LocationButton onFix={(f) => { setError(null); setFix(f); }} onError={setError} active={watching} onActiveChange={setWatching} /></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"><div className="space-y-3">
              {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"><strong>Live location needs attention</strong><p className="mt-1 text-muted-foreground">{error}</p></div>}
              {fix && <StatusPanel fix={fix} now={now} />}
              <FavoritesPanel currentDestination={destination} onPick={setDestination} />
              <NearbyChips origin={fix} onPick={setDestination} />
              {routes.length > 1 && <AlternativesPanel routes={routes} selectedIndex={selectedRouteIdx} onSelect={setSelectedRouteIdx} prefs={prefs} onPrefsChange={setPrefs} />}
              {route && <BatteryPanel routeKm={route.distanceMeters / 1000} encodedPolyline={route.encodedPolyline} onAddStop={addWaypoint} />}
              {route && <DirectionsPanel route={route} fix={fix} />}
              <RoutePreview route={route} destinationName={destination?.name ?? null} loading={routeLoading} error={routeError} offRoute={offRoute} offline={offlineCache} />
              <FeasibilityNote />
              <PairPhonePanel onPairedFix={(p) => { setError(null); setWatching(true); setFix({ ...p, source: "phone" }); }} onPairedNav={applyPairedNav} />
            </div></div>
          </aside>
        )}
        {hudMode && <div className="hidden"><PairPhonePanel onPairedFix={(p) => { setError(null); setWatching(true); setFix({ ...p, source: "phone" }); }} onPairedNav={applyPairedNav} /></div>}

        <main className={`relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted shadow-xl shadow-foreground/10 ${hudMode ? "" : "rounded-[1.35rem] border border-border lg:ml-3"}`}>
          {!hudMode && <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-3 p-3 sm:p-5 lg:items-start lg:pl-5"><div className="pointer-events-auto w-full max-w-2xl lg:max-w-[520px]"><DestinationSearch onSelect={(d) => { setPreview(d); setToolsOpen(false); }} origin={fix} /></div><div className="pointer-events-auto flex max-w-full gap-2 overflow-x-auto pb-1 lg:max-w-[520px]">{MAP_CATEGORIES.map((c) => <button key={c.key} type="button" onClick={() => runCategory(c.key)} disabled={!fix} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold shadow-md backdrop-blur transition disabled:opacity-40 ${poiCat === c.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card/95 text-card-foreground hover:bg-card"}`}><span className="mr-1" aria-hidden>{c.emoji}</span>{c.label}</button>)}{poiLoading && <span className="self-center rounded-full bg-card/95 px-3 py-2 text-xs text-muted-foreground shadow">Searching…</span>}</div></div>}
          {!hudMode && <button type="button" onClick={() => setToolsOpen((v) => !v)} aria-label={toolsOpen ? "Close map tools" : "Open map tools"} className="absolute left-4 top-28 z-40 grid min-h-12 min-w-12 place-items-center rounded-xl border border-border bg-card/95 text-foreground shadow-lg backdrop-blur-xl lg:hidden"><span className="text-xl" aria-hidden>{toolsOpen ? "×" : "☰"}</span></button>}
          {!hudMode && <MapControls mapType={mapType} traffic={showTraffic} onMapTypeChange={setMapType} onTrafficChange={setShowTraffic} />}
          {preview && !navigating && !hudMode && <div className="pointer-events-auto absolute inset-x-0 bottom-4 z-40 flex justify-center px-3 sm:bottom-6 sm:px-4 lg:justify-start lg:pl-5"><div className="w-full max-w-xl"><PlaceSheet place={preview} fix={fix} loading={routeLoading} onDirections={() => startTo(preview)} onClose={() => setPreview(null)} /></div></div>}
          {navigating && route && <NavBanner route={route} fix={fix} onStop={stopNav} liveRemainingMeters={progress?.remainingMeters} alongMeters={progress?.along} />}
          {hudMode && route && <HudBottomBar route={route} fix={fix} onCancel={() => { setHudMode(false); setNavigating(false); setDestination(null); setRoutes([]); }} onRecenter={() => setRecenterSignal((n) => n + 1)} liveRemainingMeters={progress?.remainingMeters} muted={muted} onToggleMute={() => setMuted((m) => !m)} />}
          {resumedName && <div className="pointer-events-auto absolute inset-x-0 bottom-6 z-30 flex justify-center px-4"><div className="flex items-center gap-3 rounded-full border border-border bg-card/95 px-4 py-2 text-sm shadow-lg backdrop-blur"><span aria-hidden>↻</span><span className="font-medium text-card-foreground">Resumed trip to <span className="font-semibold">{resumedName}</span></span><button type="button" onClick={() => { setResumedName(null); setDestination(null); setNavigating(false); setWaypoints([]); clearSession(); }} className="min-h-11 rounded-full border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted">Cancel</button></div></div>}
          <ClientOnly fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading map…</div>}><Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading map…</div>}><MapView fix={fix} destination={destination} encodedPolyline={route?.encodedPolyline ?? null} navigating={navigating} rerouting={rerouting} showTraffic={showTraffic} mapTypeId={mapType} onProgress={setProgress} waypoints={waypoints} alternates={routes.map((r, i) => ({ encodedPolyline: r.encodedPolyline, index: i }))} onSelectAlternate={setSelectedRouteIdx} recenterSignal={recenterSignal} preview={preview} pois={pois} onPickPoi={(p) => setPreview({ lat: p.lat, lng: p.lng, name: p.name, address: p.address })} onMapClick={handleMapClick} /></Suspense></ClientOnly>
        </main>
      </div>
    </div>
  );
}