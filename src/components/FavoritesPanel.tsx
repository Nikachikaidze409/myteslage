import { memo, useState } from "react";
import {
  useHomeWork,
  useRecents,
  useFavorites,
  setNamedFavorite,
  toggleFavorite,
} from "@/lib/favorites";
import type { Destination } from "@/components/DestinationSearch";

interface Props {
  currentDestination: Destination | null;
  onPick: (d: Destination) => void;
}

function FavoritesPanelImpl({ currentDestination, onPick }: Props) {
  const { home, work } = useHomeWork();
  const recents = useRecents();
  const favs = useFavorites().filter((f) => f.kind !== "home" && f.kind !== "work");
  const [managing, setManaging] = useState(false);

  const setNamed = (kind: "home" | "work") => {
    if (!currentDestination) return;
    setNamedFavorite(kind, {
      lat: currentDestination.lat,
      lng: currentDestination.lng,
      name: currentDestination.name,
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Places
        </div>
        {currentDestination && (
          <button
            type="button"
            onClick={() => setManaging((v) => !v)}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            {managing ? "Done" : "Save current"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FavButton
          label="Home"
          emoji="🏠"
          value={home}
          onPick={onPick}
          onSet={managing ? () => setNamed("home") : undefined}
        />
        <FavButton
          label="Work"
          emoji="💼"
          value={work}
          onPick={onPick}
          onSet={managing ? () => setNamed("work") : undefined}
        />
      </div>

      {favs.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Favorites</div>
          <ul className="flex flex-col gap-1">
            {favs.slice(0, 4).map((f) => (
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
                  aria-label="Remove favorite"
                  onClick={() => toggleFavorite({ lat: f.lat, lng: f.lng, name: f.name })}
                  className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recents.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Recent</div>
          <ul className="flex flex-col gap-1">
            {recents.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onPick({ lat: r.lat, lng: r.lng, name: r.name })}
                  className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  🕒 {r.name}
                </button>
                <button
                  type="button"
                  aria-label="Save as favorite"
                  onClick={() => toggleFavorite({ lat: r.lat, lng: r.lng, name: r.name })}
                  className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
                  title="Add to favorites"
                >
                  ☆
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FavButton({
  label,
  emoji,
  value,
  onPick,
  onSet,
}: {
  label: string;
  emoji: string;
  value: { lat: number; lng: number; name: string } | null;
  onPick: (d: Destination) => void;
  onSet?: () => void;
}) {
  if (onSet) {
    return (
      <button
        type="button"
        onClick={onSet}
        className="rounded-xl border border-dashed border-primary/50 bg-primary/5 p-3 text-left text-sm text-primary hover:bg-primary/10"
      >
        {emoji} Set {label}
      </button>
    );
  }
  if (!value) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-left text-sm text-muted-foreground">
        {emoji} {label} not set
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onPick({ lat: value.lat, lng: value.lng, name: value.name })}
      className="rounded-xl border border-border bg-muted/40 p-3 text-left text-sm text-foreground hover:bg-muted"
    >
      <div className="font-semibold">{emoji} {label}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{value.name}</div>
    </button>
  );
}

export const FavoritesPanel = memo(FavoritesPanelImpl);
