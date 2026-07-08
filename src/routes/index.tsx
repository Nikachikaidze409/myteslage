import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState } from "react";
import { LocationButton } from "@/components/LocationButton";
import { StatusPanel, type Fix } from "@/components/StatusPanel";
import { DestinationSearch, type Destination } from "@/components/DestinationSearch";
import { RoutePreview } from "@/components/RoutePreview";
import { FeasibilityNote } from "@/components/FeasibilityNote";
import { computeRoute, type RouteResult } from "@/lib/routes.functions";

const MapView = lazy(() =>
  import("@/components/MapView").then((m) => ({ default: m.MapView })),
);

export const Route = createFileRoute("/")({
  component: Index,
});

const SAMPLE_FIX: Fix = {
  lat: 41.7151,
  lng: 44.8271,
  accuracy: 20,
  timestamp: Date.now(),
  source: "sample",
};

function Index() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [destination, setDestination] = useState<Destination | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!fix || !destination) return;
    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);
    computeRoute({ data: { origin: { lat: fix.lat, lng: fix.lng }, destination } })
      .then((r) => {
        if (!cancelled) setRoute(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setRouteError(e instanceof Error ? e.message : "Route failed");
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fix?.lat, fix?.lng, destination]);

  const useSample = () => {
    setError(null);
    setFix({ ...SAMPLE_FIX, timestamp: Date.now() });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-[1600px] gap-4 p-4 lg:grid-cols-[420px_1fr]">
        {/* Sidebar */}
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <header>
            <div className="text-xs uppercase tracking-[0.2em] text-primary">Tesla · Prototype</div>
            <h1 className="mt-1 text-2xl font-semibold leading-tight">
              Browser navigation for imported Teslas in Georgia
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Experimental workaround. This page uses the browser's geolocation API — accuracy
              depends on the Tesla browser, Wi-Fi, cell towers, and IP. It is not a native GPS
              replacement.
            </p>
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

          {error && (
            <div className="rounded-xl border border-[color:var(--bad)]/40 bg-[color:var(--bad)]/10 p-4">
              <div className="text-sm font-semibold text-[color:var(--bad)]">
                Geolocation unavailable
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <button
                onClick={useSample}
                className="mt-3 h-11 w-full rounded-lg border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-accent"
              >
                Use sample location (Tbilisi) for demo
              </button>
            </div>
          )}

          {fix && <StatusPanel fix={fix} now={now} />}

          <DestinationSearch onSelect={setDestination} disabled={!fix} />

          <RoutePreview
            route={route}
            destinationName={destination?.name ?? null}
            loading={routeLoading}
            error={routeError}
          />

          {!fix && !error && (
            <button
              onClick={useSample}
              className="h-11 rounded-lg border border-border bg-secondary text-sm text-secondary-foreground hover:bg-accent"
            >
              Try sample location
            </button>
          )}

          <FeasibilityNote />
        </aside>

        {/* Map */}
        <main className="relative min-h-[400px] overflow-hidden rounded-xl border border-border bg-card lg:min-h-full">
          <ClientOnly fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading map…</div>}>
            <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading map…</div>}>
              <MapView
                fix={fix}
                destination={destination}
                encodedPolyline={route?.encodedPolyline ?? null}
              />
            </Suspense>
          </ClientOnly>
        </main>
      </div>
    </div>
  );
}
