import { useEffect, useMemo, useRef, useState } from "react";
import { decodePolyline, distanceMeters } from "@/lib/geo";
import type { RouteResult } from "@/lib/routes.functions";
import type { PairedFix } from "@/lib/pair-channel";

interface Props {
  fix: PairedFix | null;
  route: RouteResult | null;
  destinationName?: string | null;
  onExit: () => void;
}

/**
 * Speed in km/h for the dashboard. Phone browsers often report `speed` as
 * null, 0 or a value that lags several seconds behind, so we fall back to the
 * distance travelled between two consecutive fixes, which updates instantly.
 */
export function deriveSpeedKmh(
  prev: { lat: number; lng: number; timestamp: number } | null,
  cur: { lat: number; lng: number; timestamp: number; speed?: number | null; accuracy?: number } | null,
): number | null {
  if (!cur) return null;
  if (prev) {
    const dt = (cur.timestamp - prev.timestamp) / 1000;
    if (dt > 0.15 && dt < 12) {
      const d = distanceMeters(prev, cur);
      // Ignore GPS jitter while standing still.
      const derived = d < 1.5 ? 0 : (d / dt) * 3.6;
      if (derived >= 0 && derived < 260) return Math.round(derived);
    }
  }
  if (typeof cur.speed === "number" && cur.speed >= 0) return Math.round(cur.speed * 3.6);
  return null;
}

/** Pick an arrow for a Google step instruction. */
export function maneuverIcon(instruction: string): string {
  const t = (instruction || "").toLowerCase();
  if (/u-turn|make a u/.test(t)) return "⤶";
  if (/roundabout|circle/.test(t)) return "⟳";
  if (/slight left|keep left|bear left/.test(t)) return "↖";
  if (/slight right|keep right|bear right/.test(t)) return "↗";
  if (/left/.test(t)) return "←";
  if (/right/.test(t)) return "→";
  if (/merge|exit|ramp/.test(t)) return "↱";
  if (/destination|arrive/.test(t)) return "◎";
  return "↑";
}

/** Strip Google's HTML markup from a step instruction. */
export function plainInstruction(instruction: string): string {
  return (instruction || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Next step plus distance to it, computed from the step polylines. Pure
 * geometry — no extra Google calls, so the HUD costs nothing to run.
 */
export function nextStepFor(
  route: RouteResult | null,
  fix: { lat: number; lng: number } | null,
): { instruction: string; distanceM: number } | null {
  if (!route || !fix || route.steps.length === 0) return null;
  let best: { idx: number; d: number } | null = null;
  const decoded = route.steps.map((s) => (s.polyline ? decodePolyline(s.polyline) : []));
  decoded.forEach((pts, idx) => {
    for (const p of pts) {
      const d = distanceMeters(fix, p);
      if (!best || d < best.d) best = { idx, d };
    }
  });
  if (!best) return null;
  const chosen = best as { idx: number; d: number };
  const pts = decoded[chosen.idx] ?? [];
  const end = pts[pts.length - 1];
  const step = route.steps[chosen.idx];
  if (!step) return null;
  const remaining = end ? distanceMeters(fix, end) : step.distanceMeters;
  return { instruction: plainInstruction(step.instruction), distanceM: Math.round(remaining) };
}

/**
 * Big, high-contrast dashboard for a phone mounted on the steering column —
 * Model 3 / Model Y have no screen behind the wheel.
 */
export function PhoneHud({ fix, route, destinationName, onExit }: Props) {
  const next = useMemo(() => nextStepFor(route, fix), [route, fix]);
  const prevFixRef = useRef<PairedFix | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);

  // Recompute on every fix: no debounce, so the number tracks the car live.
  useEffect(() => {
    if (!fix) return;
    const v = deriveSpeedKmh(prevFixRef.current, fix);
    prevFixRef.current = fix;
    if (v != null) setSpeed(v);
  }, [fix]);

  const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between bg-black p-5 text-white">
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/50">
          Speedometer
        </div>
        <button
          onClick={onExit}
          className="rounded-lg border border-white/25 px-3 py-1 text-xs font-semibold text-white/80"
        >
          Close
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {next ? (
          <>
            <div className="text-[110px] leading-none">{maneuverIcon(next.instruction)}</div>
            <div className="text-5xl font-bold tabular-nums">{dist(next.distanceM)}</div>
            <div className="max-w-xs text-lg text-white/80">{next.instruction}</div>
          </>
        ) : (
          <div className="text-xl text-white/60">
            {destinationName ? "Getting the route…" : "No trip yet"}
          </div>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-[64px] font-bold leading-none tabular-nums">{speed ?? "--"}</div>
          <div className="text-xs uppercase tracking-widest text-white/50">km/h</div>
        </div>
        <div className="max-w-[55%] text-right text-sm text-white/60">
          {destinationName ?? ""}
          {route && (
            <div className="mt-1 tabular-nums">
              {dist(Math.round(route.distanceMeters))} · {Math.round(route.durationSeconds / 60)} min
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
