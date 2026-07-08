import type { RouteResult } from "@/lib/routes.functions";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function maneuverIcon(instruction: string): "left" | "right" | "straight" | "uturn" | "merge" | "arrive" {
  const s = instruction.toLowerCase();
  if (s.includes("u-turn") || s.includes("uturn")) return "uturn";
  if (s.includes("arrive") || s.includes("destination")) return "arrive";
  if (s.includes("merge")) return "merge";
  if (s.includes("left")) return "left";
  if (s.includes("right")) return "right";
  return "straight";
}

function Arrow({ kind }: { kind: ReturnType<typeof maneuverIcon> }) {
  const rotate = kind === "right" ? "rotate-90" : kind === "left" ? "-rotate-90" : kind === "uturn" ? "rotate-180" : "";
  return (
    <svg className={"h-5 w-5 " + rotate} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 20V4m0 0l-6 6m6-6l6 6" />
    </svg>
  );
}

export function DirectionsPanel({ route }: { route: RouteResult }) {
  if (!route.steps.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="font-display mb-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Next Steps
      </div>
      <ol className="max-h-[42vh] space-y-6 overflow-y-auto pr-1">
        {route.steps.map((s, i) => {
          const active = i === 0;
          const isLast = i === route.steps.length - 1;
          const kind = maneuverIcon(s.instruction);
          return (
            <li key={i} className={"flex gap-4 " + (active ? "" : "opacity-60")}>
              <div className="flex flex-col items-center">
                <div
                  className={
                    "grid h-10 w-10 place-items-center rounded-xl " +
                    (active
                      ? "bg-primary text-white shadow-lg shadow-primary/25"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  <Arrow kind={kind} />
                </div>
                {!isLast && <div className="mt-2 h-10 w-0.5 bg-muted" />}
              </div>
              <div className="min-w-0 pt-1">
                {s.distanceMeters > 0 && (
                  <p className="font-display text-lg font-bold leading-tight text-foreground">
                    {s.distanceMeters >= 1000
                      ? `${(s.distanceMeters / 1000).toFixed(1)} km`
                      : `${Math.round(s.distanceMeters)} m`}
                  </p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">{stripHtml(s.instruction)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}