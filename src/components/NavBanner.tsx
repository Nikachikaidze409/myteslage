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
  liveRemainingMeters?: number;
  /** metres travelled along the active route (live, from the map engine) */
  alongMeters?: number;
}

export function NavBanner({ route, fix, onStop, liveRemainingMeters, alongMeters }: Props) {
  const stepStarts = useMemo(
    () => route.steps.map((s) => (s.polyline ? decodePolyline(s.polyline)[0] : null)),
    [route],
  );
  // Cumulative distance at the END of each step.
  const stepEnds = useMemo(() => {
    let acc = 0;
    return route.steps.map((s) => (acc += s.distanceMeters));
  }, [route]);

  let currentIdx = 0;
  let distToTurn = 0;
  if (alongMeters != null && stepEnds.length > 0) {
    // Live along-route progress gives an exact, continuously counting distance.
    currentIdx = stepEnds.findIndex((end) => end > alongMeters);
    if (currentIdx < 0) currentIdx = stepEnds.length - 1;
    distToTurn = Math.max(0, stepEnds[currentIdx] - alongMeters);
  } else if (fix) {
    let best = Infinity;
    stepStarts.forEach((p, i) => {
      if (!p) return;
      const d = distanceMeters(fix, p);
      if (d < best) { best = d; currentIdx = i; }
    });
    const nextIdx = Math.min(currentIdx + 1, stepStarts.length - 1);
    const nextP = stepStarts[nextIdx];
    if (nextP) distToTurn = distanceMeters(fix, nextP);
  }
  const step = route.steps[currentIdx];
  if (!step) return null;
  const dText = distToTurn >= 1000
    ? `${(distToTurn / 1000).toFixed(1)} km`
    : `${Math.max(0, Math.round(distToTurn / 10) * 10)} m`;
  const liveDistance = liveRemainingMeters ?? route.distanceMeters;
  const liveDuration = route.durationSeconds * (liveDistance / Math.max(1, route.distanceMeters));
  const eta = new Date(Date.now() + liveDuration * 1000);


  return (
    <div className="pointer-events-auto absolute left-6 top-6 z-30 w-[min(460px,calc(100%-3rem))] animate-in fade-in slide-in-from-top-4 rounded-3xl bg-primary p-5 text-primary-foreground shadow-2xl shadow-primary/30">
      <div className="flex items-center gap-5">
        <div className="flex flex-col items-center">
          <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 20V4m0 0l-6 6m6-6l6 6" />
          </svg>
          <span className="mt-1 text-[10px] font-bold uppercase tracking-wider opacity-90">{dText}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider opacity-80">Next</p>
          <p className="font-display truncate text-2xl font-bold leading-tight">{stripHtml(step.instruction)}</p>
          <p className="mt-1 text-[11px] opacity-80">
            {Math.max(0, Math.round(liveDuration / 60))} min · {(liveDistance / 1000).toFixed(1)} km left · arrive{" "}
            {eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}

          </p>
        </div>
        <button
          onClick={onStop}
          className="shrink-0 self-start rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white transition hover:bg-white/25"
        >
          End
        </button>
      </div>
    </div>
  );
}
