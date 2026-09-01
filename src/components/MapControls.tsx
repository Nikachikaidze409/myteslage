import type { ReactNode } from "react";

interface Props {
  mapType: "roadmap" | "satellite" | "terrain";
  traffic: boolean;
  onMapTypeChange: (type: "roadmap" | "satellite" | "terrain") => void;
  onTrafficChange: (enabled: boolean) => void;
}

function ControlIcon({ children }: { children: React.ReactNode }) {
  return <span className="grid size-5 place-items-center" aria-hidden>{children}</span>;
}

export function MapControls({ mapType, traffic, onMapTypeChange, onTrafficChange }: Props) {
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-30 flex flex-col items-end gap-2">
      <div className="flex overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur-xl">
        <button type="button" aria-label="Road map" title="Road map" onClick={() => onMapTypeChange("roadmap")} className={`grid min-h-11 min-w-11 place-items-center transition ${mapType === "roadmap" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}><ControlIcon>▦</ControlIcon></button>
        <button type="button" aria-label="Satellite map" title="Satellite map" onClick={() => onMapTypeChange("satellite")} className={`grid min-h-11 min-w-11 place-items-center transition ${mapType === "satellite" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}><ControlIcon>◈</ControlIcon></button>
        <button type="button" aria-label="Terrain map" title="Terrain map" onClick={() => onMapTypeChange("terrain")} className={`grid min-h-11 min-w-11 place-items-center transition ${mapType === "terrain" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}><ControlIcon>⌁</ControlIcon></button>
      </div>
      <button type="button" aria-pressed={traffic} onClick={() => onTrafficChange(!traffic)} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold shadow-lg backdrop-blur-xl transition ${traffic ? "border-primary/30 bg-primary text-primary-foreground" : "border-border bg-card/95 text-card-foreground hover:bg-muted"}`}>
        <ControlIcon><span className="text-sm">≋</span></ControlIcon> Traffic
      </button>
    </div>
  );
}
