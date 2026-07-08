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
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Route preview</div>
      {loading && <div className="mt-2 text-foreground">Computing route…</div>}
      {error && <div className="mt-2 text-[color:var(--bad)]">{error}</div>}
      {route && (
        <div className="mt-2">
          <div className="text-lg text-foreground">→ {destinationName}</div>
          <div className="mt-2 flex gap-6 font-mono text-2xl text-foreground">
            <span>{(route.distanceMeters / 1000).toFixed(1)} km</span>
            <span>{Math.round(route.durationSeconds / 60)} min</span>
          </div>
        </div>
      )}
    </div>
  );
}