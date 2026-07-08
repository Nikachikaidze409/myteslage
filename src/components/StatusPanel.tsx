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

export function StatusPanel({ fix, now }: { fix: Fix; now: number }) {
  const age = now - fix.timestamp;
  const precision = scorePrecision(fix.accuracy, age);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Location fix
        </h2>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider text-background"
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

      <p className="mt-4 text-sm text-muted-foreground">
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
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg text-foreground">{value}</div>
    </div>
  );
}