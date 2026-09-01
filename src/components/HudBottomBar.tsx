import type { RouteResult } from "@/lib/routes.functions";
import type { Fix } from "./StatusPanel";

interface Props {
  route: RouteResult;
  fix: Fix | null;
  onCancel: () => void;
  onRecenter: () => void;
  muted: boolean;
  onToggleMute: () => void;
  liveRemainingMeters?: number;
}

function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m / 10) * 10)} m`;
}
function fmtDuration(s: number) {
  const total = Math.max(0, Math.round(s / 60));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h} h ${m} m`;
}
function fmtEta(s: number) {
  const d = new Date(Date.now() + s * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HudBottomBar({ route, fix, onCancel, onRecenter, muted, onToggleMute, liveRemainingMeters }: Props) {
  const speedKmh = fix?.speed != null ? Math.max(0, Math.round(fix.speed * 3.6)) : null;
  const remaining = liveRemainingMeters ?? route.distanceMeters;
  const liveDuration = route.durationSeconds * (remaining / Math.max(1, route.distanceMeters));
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/85 px-8 py-5 text-white backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6">
        <div className="flex flex-col">
          <div className="text-[11px] font-bold uppercase tracking-widest opacity-70">ETA</div>
          <div className="font-display text-3xl font-bold leading-none">{fmtEta(liveDuration)}</div>
        </div>
        <div className="flex flex-col">
          <div className="text-[11px] font-bold uppercase tracking-widest opacity-70">Remaining</div>
          <div className="font-display text-3xl font-bold leading-none">{fmtDist(route.distanceMeters)}</div>
        </div>
        <div className="flex flex-col">
          <div className="text-[11px] font-bold uppercase tracking-widest opacity-70">Time</div>
          <div className="font-display text-3xl font-bold leading-none">{fmtDuration(route.durationSeconds)}</div>
        </div>
        {speedKmh != null && (
          <div className="flex flex-col">
            <div className="text-[11px] font-bold uppercase tracking-widest opacity-70">Speed</div>
            <div className="font-display text-3xl font-bold leading-none">{speedKmh} <span className="text-sm opacity-70">km/h</span></div>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onRecenter}
            className="h-14 rounded-2xl border border-white/20 bg-white/10 px-5 text-base font-semibold hover:bg-white/20"
          >
            Recenter
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="h-14 rounded-2xl border border-white/20 bg-white/10 px-5 text-base font-semibold hover:bg-white/20"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-14 rounded-2xl bg-[color:var(--bad)] px-6 text-base font-bold text-white shadow-lg hover:brightness-110"
          >
            End trip
          </button>
        </div>
      </div>
    </div>
  );
}