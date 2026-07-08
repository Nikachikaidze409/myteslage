import type { RouteResult, AvoidOption } from "@/lib/routes.functions";

interface Props {
  routes: RouteResult[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  avoid: AvoidOption[];
  onAvoidChange: (v: AvoidOption[]) => void;
}

export function AlternativesPanel({
  routes,
  selectedIndex,
  onSelect,
  avoid,
  onAvoidChange,
}: Props) {
  if (routes.length === 0) return null;

  const toggle = (o: AvoidOption) => {
    onAvoidChange(avoid.includes(o) ? avoid.filter((x) => x !== o) : [...avoid, o]);
  };

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Route options
      </div>
      <ul className="mb-3 flex flex-col gap-2">
        {routes.map((r, i) => {
          const selected = i === selectedIndex;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/30 hover:bg-muted"
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {r.label ?? (i === 0 ? "Fastest" : `Alternate ${i}`)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {(r.distanceMeters / 1000).toFixed(1)} km
                  </div>
                </div>
                <div
                  className={`font-display text-lg font-bold ${
                    selected ? "text-primary" : "text-foreground"
                  }`}
                >
                  {Math.round(r.durationSeconds / 60)} min
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {(["highways", "tolls", "ferries"] as AvoidOption[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={`rounded-full border px-2.5 py-1 text-[11px] capitalize transition ${
              avoid.includes(o)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            Avoid {o}
          </button>
        ))}
      </div>
    </div>
  );
}