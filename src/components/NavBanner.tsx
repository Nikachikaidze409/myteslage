import type { RouteResult } from "@/lib/routes.functions";
import type { Fix } from "./StatusPanel";
import { decodePolyline, distanceMeters } from "@/lib/geo";
import { useMemo } from "react";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

interface Props {
  route: RouteResult;
  fix: Fix | null;
  onStop: () => void;
}

export function NavBanner({ route, fix, onStop }: Props) {
  const stepStarts = useMemo(
    () => route.steps.map((s) => (s.polyline ? decodePolyline(s.polyline)[0] : null)),
    [route],
  );

  let currentIdx = 0;
  let distToTurn = 0;
  if (fix) {
    let best = Infinity;
    stepStarts.forEach((p, i) => {
      if (!p) return;
      const d = distanceMeters(fix, p);
      if (d < best) { best = d; currentIdx = i; }
    });
    // Show distance to end of current step (next turn)
    const nextIdx = Math.min(currentIdx + 1, stepStarts.length - 1);
    const nextP = stepStarts[nextIdx];
    if (nextP) distToTurn = distanceMeters(fix, nextP);
  }
  const step = route.steps[currentIdx];
  if (!step) return null;
  const dText = distToTurn >= 1000
    ? `${(distToTurn / 1000).toFixed(1)} km`
    : `${Math.max(0, Math.round(distToTurn / 10) * 10)} m`;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-30 w-[min(680px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-border/60 bg-card/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="min-w-[92px] text-center">
          <div className="font-mono text-3xl font-bold text-primary">{dText}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">to next turn</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-lg font-semibold text-foreground">{stripHtml(step.instruction)}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            Step {currentIdx + 1} / {route.steps.length} · {(route.distanceMeters / 1000).toFixed(1)} km total · {Math.round(route.durationSeconds / 60)} min
          </div>
        </div>
        <button
          onClick={onStop}
          className="shrink-0 h-10 rounded-lg border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-accent"
        >
          End
        </button>
      </div>
    </div>
  );
}