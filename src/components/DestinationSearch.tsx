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
      <div className="flex h-16 w-full items-center rounded-2xl border border-white bg-white/90 px-6 shadow-xl shadow-slate-300/40 backdrop-blur-md transition focus-within:ring-2 focus-within:ring-primary/30">
        <svg className="mr-4 h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          id="tsl-destination-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Where to?"
          disabled={disabled}
          className="font-display w-full bg-transparent text-lg text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Insert space"
          title="Insert space"
          onMouseDown={(e) => {
            // Prevent the input from losing focus / the on-screen keyboard from hiding.
            e.preventDefault();
            const el = document.getElementById("tsl-destination-input") as HTMLInputElement | null;
            const start = el?.selectionStart ?? q.length;
            const end = el?.selectionEnd ?? q.length;
            const next = q.slice(0, start) + " " + q.slice(end);
            setQ(next);
            requestAnimationFrame(() => {
              if (el) {
                el.focus();
                el.setSelectionRange(start + 1, start + 1);
              }
            });
          }}
          className="ml-2 h-10 shrink-0 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-foreground shadow-sm hover:bg-muted"
        >
          Space
        </button>
      </div>
      {suggestions.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl shadow-slate-300/40">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="block w-full px-5 py-3 text-left transition hover:bg-muted"
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