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
} from "@/lib/favorites";

const MapView = lazy(() =>
  import("@/components/MapView").then((m) => ({ default: m.MapView })),
);

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [destination, setDestination] = useState<Destination | null>(null);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [avoid, setAvoid] = useState<AvoidOption[]>([]);
  const [waypoints, setWaypoints] = useState<{ lat: number; lng: number; name: string }[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [offRoute, setOffRoute] = useState(false);
  const [showTraffic, setShowTraffic] = useState(true);
  const [offlineCache, setOfflineCache] = useState(false);
  const online = useNetworkStatus();

  const routeRequestRef = useRef(0);
  const lastRouteOriginRef = useRef<Fix | null>(null);
  const lastLiveRouteAtRef = useRef(0);
  const offRouteSinceRef = useRef<number | null>(null);
  const lastRerouteAtRef = useRef(0);

  const route = routes[selectedRouteIdx] ?? null;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
      computeRoute({
        data: {
          origin: { lat: originFix.lat, lng: originFix.lng },
          destination: nextDestination,
          alternatives: true,
          avoid: options?.avoid ?? avoid,
          waypoints: (options?.waypoints ?? waypoints).map((w) => ({ lat: w.lat, lng: w.lng })),
        },
      })
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
    [avoid, waypoints],
  );

  // New destination selected
  useEffect(() => {
    setRoutes([]);
    setSelectedRouteIdx(0);
    setWaypoints([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination]);

  // Avoid options or waypoints changed → re-request silently
  useEffect(() => {
    if (!destination || !fix) return;
    requestRoute(fix, destination, { silent: true, avoid, waypoints });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avoid, waypoints]);

  useEffect(() => {
    if (!destination || !fix || route || routeLoading) return;
    requestRoute(fix, destination);
  }, [destination, fix, route, routeLoading, requestRoute]);

  // Live progress + off-route detection + periodic traffic-aware refresh
  useEffect(() => {
    if (!navigating || !destination || !fix || routeLoading) return;
    const lastRouteOrigin = lastRouteOriginRef.current;
    if (!lastRouteOrigin) return;

    if (route?.encodedPolyline) {
      const d = distanceToPolylineMeters({ lat: fix.lat, lng: fix.lng }, route.encodedPolyline);
      if (d > 50) {
        if (offRouteSinceRef.current == null) offRouteSinceRef.current = Date.now();
        if (
          Date.now() - (offRouteSinceRef.current ?? 0) > 6_000 &&
          Date.now() - lastRerouteAtRef.current > 10_000
        ) {
          setOffRoute(true);
          lastRerouteAtRef.current = Date.now();
          requestRoute(fix, destination);
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
  };

  const addWaypoint = (stop: { lat: number; lng: number; name: string }) => {
    setWaypoints((cur) => [...cur, stop]);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] gap-4 p-4">
        {/* Sidebar */}
        <aside className="flex w-[360px] shrink-0 flex-col gap-4 overflow-y-auto rounded-3xl border border-border bg-card/60 p-4">
          <header className="px-2 pt-2">
            <div className="font-display text-[11px] font-bold uppercase tracking-widest text-primary">
              Tesla · Georgia
            </div>
            <h1 className="font-display mt-1 text-xl font-bold leading-tight text-foreground">
              Browser navigation
            </h1>
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
              avoid={avoid}
              onAvoidChange={setAvoid}
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

        {/* Map */}
        <main className="relative min-h-[400px] flex-1 overflow-hidden rounded-3xl border border-border bg-muted shadow-xl shadow-slate-300/30 lg:min-h-full">
          {!navigating && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-6">
              <div className="pointer-events-auto w-full max-w-2xl">
                <DestinationSearch onSelect={setDestination} />
              </div>
            </div>
          )}

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

          {navigating && route && <NavBanner route={route} fix={fix} onStop={stopNav} />}

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
              />
            </Suspense>
          </ClientOnly>
        </main>
      </div>
    </div>
  );
}