import { memo, useState } from "react";
import {
  useRecents,
  useFavorites,
  addSavedPlace,
  removeSavedPlace,
} from "@/lib/favorites";
import type { Destination } from "@/components/DestinationSearch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  currentDestination: Destination | null;
  onPick: (d: Destination) => void;
}

function FavoritesPanelImpl({ currentDestination, onPick }: Props) {
  const recents = useRecents();
  const saved = useFavorites();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");

  const canAdd = !!currentDestination;

  const startAdd = () => {
    if (!currentDestination) return;
    setName(currentDestination.name ?? "");
    setDialogOpen(true);
  };

  const save = () => {
    const trimmed = name.trim().slice(0, 60);
    if (!currentDestination || !trimmed) return;
    addSavedPlace({
      name: trimmed,
      lat: currentDestination.lat,
      lng: currentDestination.lng,
    });
    setDialogOpen(false);
    setName("");
    setOpen(true);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-1 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          <span className="truncate">Saved locations</span>
          <span className="text-[10px]">{open ? "▲" : "▼"}</span>
          {saved.length > 0 && (
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              {saved.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={startAdd}
          disabled={!canAdd}
          title={canAdd ? "Add saved location" : "Select a place on the map first"}
          className="shrink-0 rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-semibold text-primary enabled:hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground"
        >
          + Add saved location
        </button>
      </div>

      {open && (
        saved.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {saved.map((f) => (
              <li key={f.id} className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onPick({ lat: f.lat, lng: f.lng, name: f.name })}
                  className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  ⭐ {f.name}
                </button>
                <button
                  type="button"
                  aria-label="Remove saved location"
                  onClick={() => removeSavedPlace(f.id)}
                  className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            No saved locations yet. Pick a place on the map, then press “Add saved location”.
          </div>
        )
      )}

      {recents.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Recent</div>
          <ul className="flex flex-col gap-1">
            {recents.slice(0, 4).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onPick({ lat: r.lat, lng: r.lng, name: r.name })}
                  className="w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  🕒 {r.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Name this place</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            placeholder="Home"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base outline-none focus:border-primary"
          />
          {currentDestination && (
            <div className="truncate text-xs text-muted-foreground">
              {currentDestination.name}
            </div>
          )}
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!name.trim()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const FavoritesPanel = memo(FavoritesPanelImpl);
