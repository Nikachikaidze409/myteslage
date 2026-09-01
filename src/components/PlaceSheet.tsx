import type { Destination } from "./DestinationSearch";
import type { Fix } from "./StatusPanel";
import { distanceMeters } from "@/lib/geo";
import { Button } from "@/components/ui/button";

interface Props {
  place: Destination;
  fix: Fix | null;
  loading?: boolean;
  onDirections: () => void;
  onClose: () => void;
  onSave?: () => void;
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

export function PlaceSheet({ place, fix, loading, onDirections, onClose, onSave }: Props) {
  const distance = fix ? distanceMeters(fix, place) : null;
  const hasHours = Boolean(place.hours?.length);
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;

  return (
    <section className="pointer-events-auto w-full overflow-hidden rounded-[1.35rem] border border-border bg-card/95 shadow-2xl shadow-foreground/15 backdrop-blur-xl" aria-label="Place details">
      <div className="flex items-start gap-3 p-5 pb-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground" aria-hidden>
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-bold text-card-foreground">{place.name}</h2>
              {place.category && <p className="mt-0.5 text-xs font-medium capitalize text-muted-foreground">{place.category.replaceAll("_", " ")}</p>}
            </div>
             <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close place details" className="min-h-11 min-w-11 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
               <span aria-hidden className="text-xl leading-none">×</span>
             </Button>
          </div>
          {place.address && <p className="mt-2 text-sm leading-5 text-muted-foreground">{place.address}</p>}
          {distance != null && <p className="mt-2 text-sm font-semibold text-primary">{formatDistance(distance)}</p>}
        </div>
      </div>

      {(place.rating != null || place.openNow != null) && (
        <div className="flex items-center gap-4 border-y border-border px-5 py-3 text-sm">
          {place.rating != null && (
            <span className="inline-flex items-center gap-1 font-semibold text-card-foreground">
              <span className="text-warn" aria-hidden>★</span> {place.rating.toFixed(1)}
              {place.ratingCount != null && <span className="font-normal text-muted-foreground">({place.ratingCount.toLocaleString()})</span>}
            </span>
          )}
          {place.openNow != null && <span className={place.openNow ? "font-semibold text-good" : "font-semibold text-destructive"}>{place.openNow ? "Open now" : "Closed"}</span>}
        </div>
      )}

      {place.summary && <p className="px-5 pt-4 text-sm leading-5 text-muted-foreground">{place.summary}</p>}
      {hasHours && (
        <details className="group border-b border-border px-5 py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-card-foreground">Opening hours <span className="float-right text-muted-foreground transition group-open:rotate-180">⌄</span></summary>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {place.hours?.map((hour) => <li key={hour}>{hour}</li>)}
          </ul>
        </details>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 p-4">
        <button type="button" disabled={loading} onClick={onDirections} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-105 disabled:opacity-60">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 14-7-3 7 3 7-14-7Z" /></svg>
          Directions
        </button>
        <button type="button" onClick={onSave} aria-label="Save place" title="Save place" className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V21l-6-3-6 3V4.5Z" /></svg>
        </button>
        <a href={mapsLink} target="_blank" rel="noreferrer" aria-label="Open place in Google Maps" title="Open in Google Maps" className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground">
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-8 8" /><path strokeLinecap="round" strokeLinejoin="round" d="M19 13v4.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5v-13A1.5 1.5 0 0 1 4.5 3H9" /></svg>
        </a>
      </div>
    </section>
  );
}
