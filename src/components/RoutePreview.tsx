import type { RouteResult } from "@/lib/routes.functions";
import { tr } from "@/lib/map-lang";

export function RoutePreview({
  route,
  destinationName,
  loading,
  error,
  offRoute,
  offline,
  onRetry,
}: {
  route: RouteResult | null;
  destinationName: string | null;
  loading: boolean;
  error: string | null;
  offRoute?: boolean;
  offline?: boolean;
  /** Shown only after automatic retries stopped: the driver asks explicitly. */
  onRetry?: (() => void) | null;
}) {
  if (!destinationName && !loading && !route && !error) return null;
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      {loading && (
        <div className="text-sm text-muted-foreground">
          {offRoute ? tr("მარშრუტს აცდით — ახლდება…", "Դուք շեղվեցիք երթուղուց — թարմացվում է…") : tr("მარშრუტი ითვლება…", "Երթուղին հաշվարկվում է…")}
        </div>
      )}
      {error && <div className="text-sm text-[color:var(--bad)]">{error}</div>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {tr("ხელახლა ცდა", "Կրկին փորձել")}
        </button>
      )}

      {route && (
        <>
          <div className="flex items-end justify-between">
            <span className="font-display text-3xl font-bold text-foreground">
              {Math.round(route.durationSeconds / 60)} {tr("წთ", "ր")}
            </span>
            <span className="font-display text-sm font-bold text-primary">
              {formatEta(route.durationSeconds)}
            </span>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {(route.distanceMeters / 1000).toFixed(1)} {tr("კმ ·", "կմ ·")} {destinationName}{tr("-მდე", "")}
            {offline && tr(" · შენახული მარშრუტი", " · Պահպանված երթուղի")}
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