// Development-only diagnostics for GPS quality and heading selection.
// Never rendered in the published app.

import type { NavDebug } from "@/lib/maps/navigationEngine";

export function NavDebugPanel({ d }: { d: NavDebug | null }) {
  if (!import.meta.env.DEV || !d) return null;
  const deg = (v: number | null) => (v == null ? "—" : `${Math.round(v)}°`);
  const rows: [string, string][] = [
    ["GPS accuracy", `± ${Math.round(d.accuracy)} m`],
    ["GPS age", `${Math.round(d.gpsAge)} ms`],
    ["GPS speed", `${(d.gpsSpeed * 3.6).toFixed(1)} km/h`],
    ["GPS heading", deg(d.gps)],
    ["Device heading", deg(d.device)],
    ["Route bearing", deg(d.route)],
    ["Filtered heading", deg(d.filtered)],
    ["Heading source", d.source],
    ["Heading confidence", d.confidence.toFixed(2)],
    ["Distance from route", `${Math.round(d.offsetFromRoute)} m`],
    ["GPS frequency", `${d.gpsHz.toFixed(2)} Hz`],
    ["Animation FPS", `${Math.round(d.fps)}`],
    ["Last GPS", d.lastFixAt ? new Date(d.lastFixAt).toLocaleTimeString() : "—"],
    ["Rejected fixes", `${d.rejected}${d.lastReject ? ` (${d.lastReject})` : ""}`],
  ];
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-40 w-56 rounded-xl bg-foreground/85 p-3 font-mono text-[10px] leading-relaxed text-background shadow-lg">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="opacity-70">{k}</span>
          <span className="font-bold">{v}</span>
        </div>
      ))}
    </div>
  );
}
