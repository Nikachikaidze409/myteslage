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
import { saveSession, loadSession, clearSession } from "@/lib/session";
import { AuthGate, signOutAndReturn } from "@/components/AuthGate";

const MapView = lazy(() =>
  import("@/components/MapView").then((m) => ({ default: m.MapView })),
);

export const Route = createFileRoute("/drive")({
  component: IndexGated,
});

function IndexGated() {
  return (
    <AuthGate>
      <Index />
    </AuthGate>
  );
}

function Index() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [destination, setDestination] = useState<Destination | null>(null);
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
  const [offlineCache, setOfflineCache] = useState(false);
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
              avoidUnpaved: prefs.avoidUnpaved,
              waypoints: (options?.waypoints ?? waypoints).map((w) => ({ lat: w.lat, lng: w.lng })),
            },
          }),
        )
        .then((resp) => {
          if (routeRequestRef.current !== requestId) return;
          setRoutes(resp.routes);
          setSelectedRouteIdx(0);
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
    // In HUD mode the phone owns routing — do not recompute on Tesla.
    if (hudMode) return;
    setRoutes([]);
    setSelectedRouteIdx(0);
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

  // Live progress + off-route detection + periodic traffic-aware refresh
  useEffect(() => {
    if (hudMode) return;
    if (!navigating || !destination || !fix || routeLoading) return;
    const lastRouteOrigin = lastRouteOriginRef.current;
    if (!lastRouteOrigin) return;

    if (route?.encodedPolyline) {
      const d = distanceToPolylineMeters({ lat: fix.lat, lng: fix.lng }, route.encodedPolyline);
      if (d > 35) {
        if (offRouteSinceRef.current == null) offRouteSinceRef.current = Date.now();
        if (
          Date.now() - (offRouteSinceRef.current ?? 0) > 2_500 &&
          Date.now() - lastRerouteAtRef.current > 5_000
        ) {
          setOffRoute(true);
          lastRerouteAtRef.current = Date.now();
          requestRoute(fix, destination, { silent: true });
          return;
        }
      } else {
        offRouteSinceRef.current = null;
        if (offRoute) setOffRoute(false);
      }
    }

    const moved = distanceMeters(fix, lastRouteOrigin);
    const elapsed = Date.now() - lastLiveRouteAtRef.current;
    if (moved >= 80 && elapsed >= 10_000) {
      lastLiveRouteAtRef.current = Date.now();
      requestRoute(fix, destination, { silent: true });
    }
  }, [destination, fix, navigating, requestRoute, routeLoading, route, offRoute]);

  const stopNav = () => {
    setNavigating(false);
    setWaypoints([]);
    setDestination(null);
    clearSession();
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
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className={`mx-auto flex h-full w-full ${hudMode ? "max-w-none p-0" : "max-w-[1600px] gap-3 p-3"}`}>
        {/* Sidebar — hidden in HUD mode (phone is the brain) */}
        {!hudMode && (
        <aside className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto rounded-3xl border border-border bg-card/60 p-3">
          <header className="px-2 pt-2">
            <div className="font-display text-[11px] font-bold uppercase tracking-widest text-primary">
              Tesla · Georgia
            </div>
            <div className="flex items-center justify-between">
              <h1 className="font-display mt-1 text-xl font-bold leading-tight text-foreground">
                Browser navigation
              </h1>
              <button
                type="button"
                onClick={() => void signOutAndReturn()}
                className="rounded-lg border border-border bg-white px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
              >
                Sign out
              </button>
            </div>
            {!online && (
              <div className="mt-2 rounded-lg border border-[color:var(--bad)]/30 bg-[color:var(--bad)]/5 px-2 py-1 text-[11px] font-semibold text-[color:var(--bad)]">
                Offline — using cached route
              </div>
            )}
          </header>

          <LocationButton
            onFix={(f) => {
              setError(null);
              setFix(f);
            }}
            onError={(msg) => setError(msg)}
            active={watching}
            onActiveChange={setWatching}
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

          <FavoritesPanel currentDestination={destination} onPick={setDestination} />

          <NearbyChips origin={fix} onPick={setDestination} />

          {routes.length > 1 && (
            <AlternativesPanel
              routes={routes}
              selectedIndex={selectedRouteIdx}
              onSelect={setSelectedRouteIdx}
              prefs={prefs}
              onPrefsChange={setPrefs}
            />
          )}

          {route && (
            <BatteryPanel
              routeKm={route.distanceMeters / 1000}
              encodedPolyline={route.encodedPolyline}
              onAddStop={addWaypoint}
            />
          )}

          {route && <DirectionsPanel route={route} />}

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

        {/* Hidden PairPhonePanel in HUD mode — still needs to be mounted to receive nav broadcasts. */}
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
          {!navigating && !hudMode && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-6">
              <div className="pointer-events-auto w-full max-w-2xl">
                <DestinationSearch onSelect={setDestination} />
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
          </div>
          )}

          {navigating && route && <NavBanner route={route} fix={fix} onStop={stopNav} />}

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
                navigating={navigating}
                showTraffic={showTraffic}
                waypoints={waypoints}
                alternates={routes.map((r, i) => ({ encodedPolyline: r.encodedPolyline, index: i }))}
                onSelectAlternate={setSelectedRouteIdx}
                recenterSignal={recenterSignal}
              />
            </Suspense>
          </ClientOnly>
        </main>
      </div>
    </div>
  );
}