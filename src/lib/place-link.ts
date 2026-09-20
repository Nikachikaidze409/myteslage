/**
 * Pure helpers for turning pasted text (a WhatsApp/Viber Google Maps link, a
 * full maps URL, or raw coordinates) into something we can route to.
 * No network calls here so the parsing rules stay unit-testable.
 */

export type PastedLocation =
  | { kind: "coords"; lat: number; lng: number }
  | { kind: "url"; url: string }
  | { kind: "query"; text: string };

const COORD_RE = /(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/;

export function validLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Pull the first http(s) URL out of a pasted message. */
export function extractUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  return m ? m[0] : null;
}

/** Classify pasted text. Returns null when there is nothing usable. */
export function parsePastedLocation(raw: string): PastedLocation | null {
  const text = (raw ?? "").trim();
  if (!text) return null;

  const url = extractUrl(text);
  if (url) {
    const fromUrl = coordsFromMapsUrl(url);
    if (fromUrl) return { kind: "coords", ...fromUrl };
    return { kind: "url", url };
  }

  const m = COORD_RE.exec(text);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (validLatLng(lat, lng)) return { kind: "coords", lat, lng };
  }

  if (text.length < 2) return null;
  return { kind: "query", text };
}

/** Extract coordinates from an already-expanded Google Maps URL. */
export function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  // ...!3d41.7151!4d44.8271 (place pin, most accurate)
  const d = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url);
  if (d) {
    const lat = Number(d[1]);
    const lng = Number(d[2]);
    if (validLatLng(lat, lng)) return { lat, lng };
  }

  try {
    const u = new URL(url);
    for (const key of ["query", "destination", "q", "center", "ll", "viewpoint", "daddr"]) {
      const v = u.searchParams.get(key);
      if (!v) continue;
      const m = COORD_RE.exec(v);
      if (m) {
        const lat = Number(m[1]);
        const lng = Number(m[2]);
        if (validLatLng(lat, lng)) return { lat, lng };
      }
    }
  } catch {
    /* not a parseable URL: fall through */
  }

  // .../@41.7151,44.8271,15z (map centre)
  const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (validLatLng(lat, lng)) return { lat, lng };
  }
  return null;
}

/** A searchable place name carried by a maps URL, when it has no coordinates. */
export function placeNameFromMapsUrl(url: string): string | null {
  try {
    const u = new URL(url);
    for (const key of ["query", "destination", "q", "daddr"]) {
      const v = u.searchParams.get(key);
      if (v && v.trim().length >= 2) return decodeURIComponent(v.replace(/\+/g, " ").trim());
    }
    const seg = /\/maps\/place\/([^/@?]+)/.exec(u.pathname);
    if (seg?.[1]) {
      const name = decodeURIComponent(seg[1].replace(/\+/g, " ")).trim();
      if (name.length >= 2) return name;
    }
    // Google's EU cookie-consent hop wraps the real maps URL in ?continue=
    const cont = u.searchParams.get("continue");
    if (cont) return placeNameFromMapsUrl(cont);
  } catch {
    /* ignore */
  }
  return null;
}

/** Only follow links that really are Google Maps share links. */
export function isAllowedMapsHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h === "maps.app.goo.gl" ||
      h === "goo.gl" ||
      h === "g.co" ||
      h === "maps.google.com" ||
      h.endsWith(".google.com") ||
      /^google\.[a-z.]+$/.test(h) ||
      /\.google\.[a-z.]+$/.test(h)
    );
  } catch {
    return false;
  }
}
