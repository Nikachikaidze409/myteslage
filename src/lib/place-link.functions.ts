import { createServerFn } from "@tanstack/react-start";
import { requireMapAccess } from "@/lib/map-access.middleware";
import { googleKey, googleFail, PLACES_API, MAPS_API } from "@/lib/google-api";
import {
  coordsFromMapsUrl,
  isAllowedMapsHost,
  parsePastedLocation,
  placeNameFromMapsUrl,
  validLatLng,
} from "@/lib/place-link";

export interface ResolvedLocation {
  lat: number;
  lng: number;
  name: string;
  address: string;
}

async function nameForPoint(lat: number, lng: number): Promise<{ name: string; address: string }> {
  try {
    const res = await fetch(
      `${MAPS_API}/maps/api/geocode/json?latlng=${lat},${lng}&language=en&key=${encodeURIComponent(googleKey())}`,
    );
    if (!res.ok) return { name: "Shared location", address: "" };
    const json = (await res.json()) as { results?: { formatted_address?: string }[] };
    const address = json.results?.[0]?.formatted_address ?? "";
    return { name: address || "Shared location", address };
  } catch {
    return { name: "Shared location", address: "" };
  }
}

async function searchText(query: string, bias?: { lat: number; lng: number }) {
  const res = await fetch(`${PLACES_API}/places:searchText`, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": googleKey(),
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: "GE",
      maxResultCount: 1,
      ...(bias
        ? { locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 50000 } } }
        : {}),
    }),
  });
  if (!res.ok) await googleFail(res, "Place search");
  const json = (await res.json()) as {
    places?: {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }[];
  };
  const p = json.places?.[0];
  const lat = p?.location?.latitude;
  const lng = p?.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return {
    lat,
    lng,
    name: p?.displayName?.text ?? p?.formattedAddress ?? query,
    address: p?.formattedAddress ?? "",
  } satisfies ResolvedLocation;
}

/**
 * Turn a pasted WhatsApp/Viber Google Maps link, full maps URL, raw
 * coordinates, or plain address text into a routable destination.
 */
export const resolvePastedLocation = createServerFn({ method: "POST" })
  .middleware([requireMapAccess])
  .inputValidator((data: { text: string; lat?: number; lng?: number }) => {
    if (!data || typeof data.text !== "string" || data.text.trim().length === 0) {
      throw new Error("Nothing to open");
    }
    if (data.text.length > 2000) throw new Error("That text is too long");
    return data;
  })
  .handler(async ({ data }): Promise<ResolvedLocation> => {
    const bias =
      typeof data.lat === "number" && typeof data.lng === "number"
        ? { lat: data.lat, lng: data.lng }
        : undefined;

    const parsed = parsePastedLocation(data.text);
    if (!parsed) throw new Error("No location found in that text");

    if (parsed.kind === "coords") {
      const meta = await nameForPoint(parsed.lat, parsed.lng);
      return { lat: parsed.lat, lng: parsed.lng, ...meta };
    }

    if (parsed.kind === "url") {
      if (!isAllowedMapsHost(parsed.url)) {
        throw new Error("That link is not a Google Maps location link");
      }
      let finalUrl = parsed.url;
      try {
        // Follow the short-link chain by hand and read the Location header.
        // A browser User-Agent makes Google answer short links with a
        // JavaScript page (HTTP 200) instead of the 302 that carries the
        // real place URL, so we deliberately do NOT pretend to be a browser.
        let current = parsed.url;
        for (let hop = 0; hop < 5; hop++) {
          const res = await fetch(current, { redirect: "manual" });
          const loc = res.headers.get("location");
          if (!loc) {
            finalUrl = res.url || current;
            // Some hosts answer 200 with the expanded page: try the body too.
            if (res.status === 200 && !coordsFromMapsUrl(finalUrl)) {
              const body = (await res.text()).slice(0, 200_000);
              const inBody =
                /\[null,null,(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})\]/.exec(body) ??
                /@(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})/.exec(body) ??
                /!3d(-?\d{1,2}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/.exec(body);
              if (inBody) {
                const lat = Number(inBody[1]);
                const lng = Number(inBody[2]);
                if (validLatLng(lat, lng)) {
                  const meta = await nameForPoint(lat, lng);
                  return { lat, lng, ...meta };
                }
              }
            }
            break;
          }
          current = new URL(loc, current).toString();
          finalUrl = current;
          const hit = coordsFromMapsUrl(current);
          if (hit && validLatLng(hit.lat, hit.lng)) {
            const meta = await nameForPoint(hit.lat, hit.lng);
            return { lat: hit.lat, lng: hit.lng, ...meta };
          }
        }
        const coords = coordsFromMapsUrl(finalUrl);
        if (coords && validLatLng(coords.lat, coords.lng)) {
          const meta = await nameForPoint(coords.lat, coords.lng);
          return { lat: coords.lat, lng: coords.lng, ...meta };
        }
      } catch {
        /* fall through to name search */
      }
      const name = placeNameFromMapsUrl(finalUrl) ?? placeNameFromMapsUrl(parsed.url);
      if (name) {
        const found = await searchText(name, bias);
        if (found) return found;
      }
      throw new Error("Could not read a location from that link");
    }

    const found = await searchText(parsed.text, bias);
    if (!found) throw new Error("No place matched that text");
    return found;
  });
