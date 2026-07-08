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
import { distanceMeters } from "@/lib/geo";
import { computeRoute, type RouteResult } from "@/lib/routes.functions";

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
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const routeRequestRef = useRef(0);
  const lastRouteOriginRef = useRef<Fix | null>(null);
  const lastLiveRouteAtRef = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const requestRoute = useCallback(
    (originFix: Fix, nextDestination: Destination, options?: { silent?: boolean }) => {
      const requestId = ++routeRequestRef.current;
      if (!options?.silent) setRouteLoading(true);
      setRouteError(null);
      computeRoute({
        data: {
          origin: { lat: originFix.lat, lng: originFix.lng },
          destination: nextDestination,
        },
      })
      .then((r) => {
        if (routeRequestRef.current === requestId) {
          setRoute(r);
          lastRouteOriginRef.current = originFix;
          // As soon as a route is ready, snap into live-follow mode so the
          // blue arrow tracks the car in real time instead of showing a
          // static zoomed-out overview.
          setNavigating(true);
        }
      })
      .catch((e: unknown) => {
        if (routeRequestRef.current === requestId) {
          setRouteError(e instanceof Error ? e.message : "Route failed");
        }
      })
      .finally(() => {
        if (routeRequestRef.current === requestId && !options?.silent) setRouteLoading(false);
      });
    },
    [],
  );

  useEffect(() => {
    setRoute(null);
    setNavigating(false);
    lastRouteOriginRef.current = null;
    if (!destination) {
      setRouteError(null);
      return;
    }
    if (!fix) {
      setRouteError("Waiting for a live location fix from the Tesla browser or paired phone.");
      return;
    }
    requestRoute(fix, destination);
    // Recompute immediately when the destination changes. Live GPS ticks are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, requestRoute]);

  useEffect(() => {
    if (!destination || !fix || route || routeLoading) return;
    requestRoute(fix, destination);
  }, [destination, fix, route, routeLoading, requestRoute]);

  useEffect(() => {
    if (!navigating || !destination || !fix || routeLoading) return;
    const lastRouteOrigin = lastRouteOriginRef.current;
    if (!lastRouteOrigin) return;
    const moved = distanceMeters(fix, lastRouteOrigin);
    const elapsed = Date.now() - lastLiveRouteAtRef.current;
    if (moved >= 80 && elapsed >= 10_000) {
      lastLiveRouteAtRef.current = Date.now();
      requestRoute(fix, destination, { silent: true });
    }
  }, [destination, fix, navigating, requestRoute, routeLoading]);

  const stopNav = () => setNavigating(false);

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

          {route && <DirectionsPanel route={route} />}

          <div className="mt-auto flex flex-col gap-3">
            <RoutePreview
              route={route}
              destinationName={destination?.name ?? null}
              loading={routeLoading}
              error={routeError}
            />
            <FeasibilityNote />
          </div>
        </aside>

        {/* Map */}
        <main className="relative min-h-[400px] flex-1 overflow-hidden rounded-3xl border border-border bg-muted shadow-xl shadow-slate-300/30 lg:min-h-full">
          {/* Search overlay */}
          {!navigating && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-6">
              <div className="pointer-events-auto w-full max-w-2xl">
                <DestinationSearch onSelect={setDestination} />
              </div>
            </div>
          )}

          {navigating && route && (
            <NavBanner route={route} fix={fix} onStop={stopNav} />
          )}

          <ClientOnly fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading map…</div>}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading map…</div>}>
              <MapView
                fix={fix}
                destination={destination}
                encodedPolyline={route?.encodedPolyline ?? null}
                navigating={navigating}
              />
            </Suspense>
          </ClientOnly>
        </main>
      </div>
    </div>
  );
}
