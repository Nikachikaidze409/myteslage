import { memo, useEffect, useState } from "react";
import { scorePrecision, formatCoord } from "@/lib/precision";

export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
  source: "geolocation" | "sample" | "phone";
}

/** The card owns its own clock: it only ticks while it is actually mounted. */
export const StatusPanel = memo(function StatusPanel({ fix }: { fix: Fix }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const age = now - fix.timestamp;
  const precision = scorePrecision(fix.accuracy, age);


  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Location Fix
        </h2>
        <span
          className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
          style={{ backgroundColor: precision.color }}
        >
          {precision.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="Latitude" value={formatCoord(fix.lat)} />
        <Field label="Longitude" value={formatCoord(fix.lng)} />
        <Field label="Accuracy" value={`± ${Math.round(fix.accuracy)} m`} />
        <Field label="Age" value={`${Math.max(0, Math.round(age / 1000))} s`} />
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {precision.description}
        {fix.source === "sample" && " · sample data"}
        {fix.source === "phone" && " · from paired phone GPS"}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display mt-1 text-base font-bold text-foreground">{value}</div>
    </div>
  );
}