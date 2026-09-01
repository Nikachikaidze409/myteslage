import { useEffect, useRef, useState } from "react";
import {
  autocompletePlaces,
  placeDetails,
  type PlaceSuggestion,
} from "@/lib/search.functions";

export interface Destination {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  rating?: number;
  ratingCount?: number;
  phone?: string;
  website?: string;
  openNow?: boolean;
  hours?: string[];
  category?: string;
  summary?: string;
  placeId?: string;
}


interface Props {
  onSelect: (d: Destination) => void;
  disabled?: boolean;
  /** current position, used to rank nearby streets first */
  origin?: { lat: number; lng: number } | null;
}

export function DestinationSearch({ onSelect, disabled, origin }: Props) {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const reqRef = useRef(0);
  const originRef = useRef(origin);
  originRef.current = origin;

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const query = q.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      const id = ++reqRef.current;
      const o = originRef.current;
      autocompletePlaces({
        data: { query, ...(o ? { lat: o.lat, lng: o.lng } : {}) },
      })
        .then((res) => {
          if (reqRef.current !== id) return;
          setSuggestions(res.suggestions);
          setError(res.suggestions.length === 0 ? "No matches found" : null);
        })
        .catch((e: unknown) => {
          if (reqRef.current !== id) return;
          console.error(e);
          setSuggestions([]);
          setError("Search unavailable. Tap to retry.");
        })
        .finally(() => {
          if (reqRef.current === id) setLoading(false);
        });
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q]);

  const pick = async (s: PlaceSuggestion) => {
    setSuggestions([]);
    setError(null);
    if (typeof s.lat === "number" && typeof s.lng === "number") {
       setQ(s.primary);
       onSelect({ lat: s.lat, lng: s.lng, name: s.primary, address: s.secondary, placeId: s.placeId });
       return;
     }
     setLoading(true);
     try {
       const d = await placeDetails({ data: { placeId: s.placeId } });
       setQ(d.name);
       onSelect({
         lat: d.lat,
         lng: d.lng,
         name: d.name,
         address: d.address,
         placeId: d.placeId,
         rating: d.rating,
         ratingCount: d.ratingCount,
         phone: d.phone,
         website: d.website,
         openNow: d.openNow,
         hours: d.hours,
         category: d.category,
         summary: d.summary,
       });
    } catch (e) {
      console.error(e);
      setError("Could not open that place. Try another result.");
    } finally {
      setLoading(false);
    }
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
          placeholder="Search a street, place or address"
          disabled={disabled}
          className="font-display w-full bg-transparent text-lg text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => {
              e.preventDefault();
              setQ("");
              setSuggestions([]);
              setError(null);
            }}
            className="ml-2 h-10 w-10 shrink-0 rounded-lg text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        )}
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

      {(suggestions.length > 0 || error || loading) && q.trim().length >= 2 && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl shadow-slate-300/40">
          {loading && (
            <div className="px-5 py-3 text-sm text-muted-foreground">Searching…</div>
          )}
          {!loading && error && (
            <button
              type="button"
              onClick={() => setQ((v) => v + "")}
              className="block w-full px-5 py-3 text-left text-sm text-muted-foreground"
            >
              {error}
            </button>
          )}
          {!loading && suggestions.length > 0 && (
            <ul>
              {suggestions.map((s) => (
                <li key={s.placeId}>
                  <button
                    type="button"
                    onClick={() => void pick(s)}
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
      )}
    </div>
  );
}
