import type { RouteResult } from "@/lib/routes.functions";
import type { RoutePrefs } from "@/lib/favorites";

interface Props {
  routes: RouteResult[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  prefs: RoutePrefs;
  onPrefsChange: (p: RoutePrefs) => void;
}

export function AlternativesPanel({
  routes,
  selectedIndex,
  onSelect,
  prefs,
  onPrefsChange,
}: Props) {
  if (routes.length === 0) return null;

  const toggle = (k: keyof RoutePrefs) => onPrefsChange({ ...prefs, [k]: !prefs[k] });
  const toggles: { k: keyof RoutePrefs; label: string }[] = [
    { k: "avoidHighways", label: "Avoid highways" },
    { k: "avoidTolls", label: "Avoid tolls" },
    { k: "avoidUnpaved", label: "Avoid unpaved" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Route options
      </div>
      <ul className="mb-3 flex flex-col gap-2">
        {routes.map((r, i) => {
          const selected = i === selectedIndex;
          const hasWarning = (r.warnings ?? []).length > 0;
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
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {r.label ?? (i === 0 ? "Fastest" : `Alternate ${i}`)}
                    {r.hasTolls && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                        Toll
                      </span>
                    )}
                    {hasWarning && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700" title={(r.warnings ?? []).join(" · ")}>
                        ⚠ Rough road
                      </span>
                    )}
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
        {toggles.map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => toggle(t.k)}
            className={`rounded-full border px-2.5 py-1 text-[11px] capitalize transition ${
              prefs[t.k]
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}