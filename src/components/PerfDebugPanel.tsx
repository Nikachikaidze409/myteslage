import type { PerfDiagnostics } from "@/lib/perf/PerformanceProfileDetector";

/**
 * Developer-only map capability telemetry (?perfdebug=1). Normal users never
 * see any of this and are never told anything about device capability.
 */
export function PerfDebugPanel({
  diag,
  onReset,
}: {
  diag: PerfDiagnostics | null;
  onReset: () => void;
}) {
  return (
    <div className="absolute left-3 top-3 z-30 w-64 rounded-lg bg-background/90 p-3 text-[11px] shadow-lg ring-1 ring-border backdrop-blur">
      <div className="mb-1 font-semibold">MAP PROFILE</div>
      {!diag ? (
        <div className="text-muted-foreground">Measuring…</div>
      ) : (
        <div className="space-y-1">
          <Row k="profile" v={diag.profile} />
          <Row k="webgl" v={diag.webgl} />
          <Row k="rendering" v={diag.renderingType} />
          <Row k="map init" v={diag.mapInitMs == null ? "—" : `${Math.round(diag.mapInitMs)} ms`} />
          <Row
            k="frame avg"
            v={diag.avgFrameMs == null ? "—" : `${diag.avgFrameMs.toFixed(1)} ms`}
          />
          <Row k="fps" v={diag.estimatedFps == null ? "—" : diag.estimatedFps.toFixed(0)} />
          <Row k="long frames" v={diag.longFrames} />
          <Row k="context loss" v={diag.contextLossEvents} />
          <Row k="fallback" v={diag.fellBack ? "yes" : "no"} />
          <Row k="persisted" v={diag.persisted ?? "—"} />
          <Row k="cores / mem" v={`${diag.cores ?? "—"} / ${diag.memoryGb ?? "—"}`} />
          <Row k="reduced motion" v={diag.reducedMotion ? "yes" : "no"} />
          <div className="pt-1 text-muted-foreground">
            {diag.reasons.map((r, i) => (
              <div key={i} className="truncate">
                {r}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onReset}
            className="mt-2 w-full rounded-md border border-border px-2 py-1 font-semibold"
          >
            Reset profile & re-test
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}
