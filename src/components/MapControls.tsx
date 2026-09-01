import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  mapType: "roadmap" | "satellite" | "terrain";
  traffic: boolean;
  onMapTypeChange: (type: "roadmap" | "satellite" | "terrain") => void;
  onTrafficChange: (enabled: boolean) => void;
}

function ControlIcon({ children }: { children: ReactNode }) {
  return <span className="grid size-5 place-items-center" aria-hidden>{children}</span>;
}

export function MapControls({ mapType, traffic, onMapTypeChange, onTrafficChange }: Props) {
  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-30 flex flex-col items-end gap-2">
      <div className="flex overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur-xl">
        <Button type="button" variant="ghost" size="icon" aria-label="Road map" title="Road map" onClick={() => onMapTypeChange("roadmap")} className={`min-h-11 min-w-11 rounded-none ${mapType === "roadmap" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}><ControlIcon>▦</ControlIcon></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Satellite map" title="Satellite map" onClick={() => onMapTypeChange("satellite")} className={`min-h-11 min-w-11 rounded-none ${mapType === "satellite" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}><ControlIcon>◈</ControlIcon></Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Terrain map" title="Terrain map" onClick={() => onMapTypeChange("terrain")} className={`min-h-11 min-w-11 rounded-none ${mapType === "terrain" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}><ControlIcon>⌁</ControlIcon></Button>
      </div>
      <Button type="button" variant={traffic ? "default" : "outline"} aria-pressed={traffic} onClick={() => onTrafficChange(!traffic)} className="min-h-11 rounded-xl px-3 text-xs font-bold shadow-lg backdrop-blur-xl">
        <ControlIcon><span className="text-sm">≋</span></ControlIcon> Traffic
      </Button>
    </div>
  );
}
