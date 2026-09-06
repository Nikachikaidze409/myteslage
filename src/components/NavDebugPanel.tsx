import type { NavDebug } from "@/lib/maps/navigationEngine";

export interface RerouteTiming {
  detectedAt: number | null;
  requestedAt: number | null;
  responseMs: number | null;
  activatedAt: number | null;
  totalMs: number | null;
  staleRejected: number;
}

interface Props {
  debug: NavDebug | null;
  state: string;
  timing?: RerouteTiming;
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{typeof v === "number" ? Math.round(v * 100) / 100 : v}</span>
    </div>
  );
}

/** Development-only navigation telemetry. Mounted with ?navdebug=1 or in dev. */
export function NavDebugPanel({ debug, state, timing }: Props) {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-30 w-72 rounded-lg bg-background/90 p-3 text-[11px] shadow-lg ring-1 ring-border backdrop-blur">
      <div className="mb-1 font-semibold">NAV · {state}</div>
      {!debug ? (
        <div className="text-muted-foreground">Waiting for a matched fix…</div>
      ) : (
        <div className="space-y-2">
          <div>
            <div className="font-semibold">GPS</div>
            <Row k="lat / lng" v={`${debug.lat.toFixed(5)}, ${debug.lng.toFixed(5)}`} />
            <Row k="accuracy" v={`${Math.round(debug.accuracy)} m`} />
            <Row k="speed" v={`${(debug.speed * 3.6).toFixed(0)} km/h`} />
            <Row k="heading" v={debug.gpsHeading == null ? "—" : Math.round(debug.gpsHeading)} />
          </div>
          <div>
            <div className="font-semibold">Matching</div>
            <Row k="segment / step" v={`${debug.segment} / ${debug.step}`} />
            <Row k="along" v={`${Math.round(debug.along)} m (was ${Math.round(debug.prevAlong)})`} />
            <Row k="offset" v={`${Math.round(debug.offset)} m / limit ${Math.round(debug.threshold)}`} />
            <Row k="route bearing" v={Math.round(debug.routeBearing)} />
            <Row k="heading diff" v={Math.round(debug.headingDiff)} />
            <Row k="direction" v={debug.direction} />
            <Row k="confidence" v={debug.confidence.toFixed(2)} />
          </div>
          <div>
            <div className="font-semibold">Navigation</div>
            <Row k="maneuver" v={debug.maneuver ?? "—"} />
            <Row k="to maneuver" v={`${Math.round(debug.maneuverDistance)} m`} />
            <Row k="off route strikes" v={debug.strikes} />
            <Row k="state" v={debug.offRoute ? "OFF ROUTE" : "on route"} />
            <Row k="reason" v={debug.reason} />
            <Row k="reroutes" v={debug.rerouteCount} />
          </div>
          {timing ? (
            <div>
              <div className="font-semibold">Reroute timing</div>
              <Row k="detected" v={timing.detectedAt ? new Date(timing.detectedAt).toLocaleTimeString() : "—"} />
              <Row k="requested" v={timing.requestedAt ? new Date(timing.requestedAt).toLocaleTimeString() : "—"} />
              <Row k="API response" v={timing.responseMs == null ? "—" : `${timing.responseMs} ms`} />
              <Row k="activated" v={timing.activatedAt ? new Date(timing.activatedAt).toLocaleTimeString() : "—"} />
              <Row k="total" v={timing.totalMs == null ? "—" : `${timing.totalMs} ms`} />
              <Row k="stale rejected" v={timing.staleRejected} />
            </div>
          ) : null}
          <div className="max-h-24 overflow-hidden text-muted-foreground">
            {debug.log.map((l, i) => (
              <div key={i} className="truncate">
                {l}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
