import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps-loader";

export interface Destination {
  lat: number;
  lng: number;
  name: string;
}

interface Props {
  onSelect: (d: Destination) => void;
  disabled?: boolean;
}

interface Suggestion {
  placeId: string;
  primary: string;
  secondary: string;
}

export function DestinationSearch({ onSelect, disabled }: Props) {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const sessionRef = useRef<any>(null);
  const gRef = useRef<any>(null);
  const placesLibRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    loadGoogleMaps().then(async (g) => {
      gRef.current = g;
      placesLibRef.current = await g.maps.importLibrary("places");
      sessionRef.current = new placesLibRef.current.AutocompleteSessionToken();
    });
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!q.trim() || !placesLibRef.current) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const { suggestions: raw } =
          await placesLibRef.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: q,
            sessionToken: sessionRef.current,
            includedRegionCodes: ["ge"],
          });
        setSuggestions(
          (raw ?? [])
            .map((s: any) => s.placePrediction)
            .filter(Boolean)
            .slice(0, 6)
            .map((p: any) => ({
              placeId: p.placeId,
              primary: p.mainText?.text ?? p.text?.text ?? "",
              secondary: p.secondaryText?.text ?? "",
            })),
        );
      } catch (e) {
        console.error(e);
      }
    }, 250);
  }, [q]);

  const pick = async (s: Suggestion) => {
    const placesLib = placesLibRef.current;
    if (!placesLib) return;
    const place = new placesLib.Place({ id: s.placeId });
    await place.fetchFields({ fields: ["location", "displayName"] });
    const loc = place.location;
    if (!loc) return;
    const name = place.displayName ?? s.primary;
    onSelect({
      lat: typeof loc.lat === "function" ? loc.lat() : loc.lat,
      lng: typeof loc.lng === "function" ? loc.lng() : loc.lng,
      name,
    });
    setQ(name);
    setSuggestions([]);
    sessionRef.current = new placesLib.AutocompleteSessionToken();
  };

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a place in Georgia…"
        disabled={disabled}
        className="h-14 w-full rounded-xl border border-border bg-card px-4 text-lg text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="block w-full px-4 py-3 text-left hover:bg-accent"
              >
                <div className="text-base text-foreground">{s.primary}</div>
                {s.secondary && (
                  <div className="text-sm text-muted-foreground">{s.secondary}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}