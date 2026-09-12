import type { PairDiag } from "@/components/PairPhonePanel";

/**
 * Development-only phone-remote session telemetry (?remotedebug=1).
 * Shows pairing state, latency and message rates. Never shows tokens or keys.
 */
export function RemoteDebugPanel({ diag }: { diag: PairDiag | null }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-30 w-64 rounded-lg bg-background/90 p-3 text-[11px] shadow-lg ring-1 ring-border backdrop-blur">
      <div className="mb-1 font-semibold">REMOTE SESSION</div>
      {!diag ? (
        <div className="text-muted-foreground">No pairing activity…</div>
      ) : (
        <div className="space-y-1">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">session</span>
            <span className="font-mono">{diag.code ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">state</span>
            <span className="font-mono">{diag.state}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">latency</span>
            <span className="font-mono">
              {diag.latencyMs == null ? "—" : `${Math.round(diag.latencyMs)} ms`}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">received/s</span>
            <span className="font-mono">{diag.rxPerSec.toFixed(1)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">reconnects</span>
            <span className="font-mono">{diag.reconnects}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">last message</span>
            <span className="font-mono">
              {diag.lastMessageAt == null
                ? "—"
                : `${((Date.now() - diag.lastMessageAt) / 1000).toFixed(1)}s ago`}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">transport</span>
            <span className="font-mono">websocket broadcast</span>
          </div>
        </div>
      )}
    </div>
  );
}
