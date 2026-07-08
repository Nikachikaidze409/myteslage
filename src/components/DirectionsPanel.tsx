import type { RouteResult } from "@/lib/routes.functions";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

export function DirectionsPanel({ route }: { route: RouteResult }) {
  if (!route.steps.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Directions</div>
        <div className="font-mono text-sm text-muted-foreground">
          {(route.distanceMeters / 1000).toFixed(1)} km ·{" "}
          {Math.round(route.durationSeconds / 60)} min
        </div>
      </div>
      <ol className="max-h-[38vh] space-y-3 overflow-y-auto pr-1">
        {route.steps.map((s, i) => (
          <li key={i} className="flex gap-3 border-b border-border/50 pb-3 last:border-0">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 font-mono text-xs text-primary">
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="text-sm text-foreground">{stripHtml(s.instruction)}</div>
              {s.distanceMeters > 0 && (
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {s.distanceMeters >= 1000
                    ? `${(s.distanceMeters / 1000).toFixed(1)} km`
                    : `${Math.round(s.distanceMeters)} m`}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}