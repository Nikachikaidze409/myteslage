import { useState } from "react";
import { searchNearby, type NearbyPlace } from "@/lib/places.functions";
import type { Destination } from "@/components/DestinationSearch";

const CATEGORIES: { key: string; label: string; emoji: string }[] = [
  { key: "gas", label: "Gas", emoji: "⛽" },
  { key: "supercharger", label: "Supercharger", emoji: "⚡" },
  { key: "food", label: "Food", emoji: "🍽" },
  { key: "coffee", label: "Coffee", emoji: "☕" },
  { key: "parking", label: "Parking", emoji: "🅿" },
];

interface Props {
  origin: { lat: number; lng: number } | null;
  onPick: (d: Destination) => void;
}

export function NearbyChips({ origin, onPick }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const [results, setResults] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (cat: string) => {
    if (!origin) {
      setError("Waiting for location");
      return;
    }
    setActive(cat);
    setLoading(true);
    setError(null);
    try {
      const { places } = await searchNearby({
        data: { lat: origin.lat, lng: origin.lng, category: cat },
      });
      setResults(places.slice(0, 5));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-white p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => run(c.key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              active === c.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/50 text-foreground hover:bg-muted"
            }`}
          >
            <span className="mr-1">{c.emoji}</span>
            {c.label}
          </button>
        ))}
      </div>
      {loading && <div className="text-xs text-muted-foreground">Searching nearby…</div>}
      {error && <div className="text-xs text-[color:var(--bad)]">{error}</div>}
      {!loading && results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick({ lat: p.lat, lng: p.lng, name: p.name })}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">{p.name}</div>
                  {p.address && (
                    <div className="truncate text-[11px] text-muted-foreground">{p.address}</div>
                  )}
                </div>
                <div className="ml-2 shrink-0 text-[11px] font-semibold text-primary">
                  {p.distanceMeters ? `${(p.distanceMeters / 1000).toFixed(1)} km` : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}