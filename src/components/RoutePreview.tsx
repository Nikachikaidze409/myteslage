import type { RouteResult } from "@/lib/routes.functions";

export function RoutePreview({
  route,
  destinationName,
  loading,
  error,
}: {
  route: RouteResult | null;
  destinationName: string | null;
  loading: boolean;
  error: string | null;
}) {
  if (!destinationName && !loading && !route && !error) return null;
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      {loading && (
        <div className="text-sm text-muted-foreground">Computing route…</div>
      )}
      {error && <div className="text-sm text-[color:var(--bad)]">{error}</div>}
      {route && (
        <>
          <div className="flex items-end justify-between">
            <span className="font-display text-3xl font-bold text-foreground">
              {Math.round(route.durationSeconds / 60)} min
            </span>
            <span className="font-display text-sm font-bold text-primary">
              {formatEta(route.durationSeconds)}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {(route.distanceMeters / 1000).toFixed(1)} km · to {destinationName}
          </p>
        </>
      )}
    </div>
  );
}

function formatEta(durationSeconds: number) {
  const arrival = new Date(Date.now() + durationSeconds * 1000);
  return arrival.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}