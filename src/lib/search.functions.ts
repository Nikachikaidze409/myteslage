import { createServerFn } from "@tanstack/react-start";
import { requireMapAccess } from "@/lib/map-access.middleware";

import { googleKey, googleFail, PLACES_API, MAPS_API } from "@/lib/google-api";

export interface PlaceSuggestion {
  placeId: string;
  primary: string;
  secondary: string;
  /** present when the suggestion already carries coordinates (text search fallback) */
  lat?: number;
  lng?: number;
}

export interface PlaceDetail {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

const fail = googleFail;

/** Type-ahead suggestions for streets, addresses and places (server side). */
export const autocompletePlaces = createServerFn({ method: "POST" })
  .middleware([requireMapAccess])
  .inputValidator((data: { query: string; lat?: number; lng?: number }) => {
    if (!data || typeof data.query !== "string") throw new Error("Invalid query");
    return data;
  })
  .handler(async ({ data }): Promise<{ suggestions: PlaceSuggestion[] }> => {
    const q = data.query.trim();
    if (q.length < 2) return { suggestions: [] };
    const headers = {
      "X-Goog-Api-Key": googleKey(),
      "Content-Type": "application/json",
    };
    const bias =
      typeof data.lat === "number" && typeof data.lng === "number"
        ? { circle: { center: { latitude: data.lat, longitude: data.lng }, radius: 50000 } }
        : undefined;

    const res = await fetch(`${PLACES_API}/places:autocomplete`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ["ge"],
        ...(bias ? { locationBias: bias } : {}),
      }),
    });
    if (!res.ok) await fail(res, "Place autocomplete");

    const json = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        };
      }[];
    };

    const suggestions: PlaceSuggestion[] = [];
    for (const s of json.suggestions ?? []) {
      const p = s.placePrediction;
      if (!p?.placeId) continue;
      suggestions.push({
        placeId: p.placeId,
        primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
        secondary: p.structuredFormat?.secondaryText?.text ?? "",
      });
      if (suggestions.length >= 6) break;
    }

    if (suggestions.length > 0) return { suggestions };

    // Fallback: full text search returns results (with coordinates) for queries
    // autocomplete cannot predict.
    const textRes = await fetch(`${PLACES_API}/places:searchText`, {
      method: "POST",
      headers: {
        ...headers,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: q,
        regionCode: "GE",
        maxResultCount: 6,
        ...(bias ? { locationBias: bias } : {}),
      }),
    });
    if (!textRes.ok) await fail(textRes, "Place search");
    const tj = (await textRes.json()) as {
      places?: {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      }[];
    };
    for (const p of tj.places ?? []) {
      if (!p.id) continue;
      suggestions.push({
        placeId: p.id,
        primary: p.displayName?.text ?? p.formattedAddress ?? "",
        secondary: p.formattedAddress ?? "",
        lat: p.location?.latitude,
        lng: p.location?.longitude,
      });
    }
    return { suggestions };
  });

/** Coordinates + address for a chosen suggestion. */
export const placeDetails = createServerFn({ method: "POST" })
  .middleware([requireMapAccess])
  .inputValidator((data: { placeId: string }) => {
    if (!data?.placeId) throw new Error("Invalid place");
    return data;
  })
  .handler(async ({ data }): Promise<PlaceDetail> => {
    const res = await fetch(
      `${PLACES_API}/places/${encodeURIComponent(data.placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": googleKey(),
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
        },
      },
    );
    if (!res.ok) await fail(res, "Place details");
    const p = (await res.json()) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };
    if (typeof p.location?.latitude !== "number" || typeof p.location?.longitude !== "number") {
      throw new Error("Place has no location");
    }
    return {
      placeId: p.id ?? data.placeId,
      name: p.displayName?.text ?? p.formattedAddress ?? "Destination",
      address: p.formattedAddress ?? "",
      lat: p.location.latitude,
      lng: p.location.longitude,
    };
  });

/** Address for an arbitrary point tapped on the map. */
export const reverseGeocode = createServerFn({ method: "POST" })
  .middleware([requireMapAccess])
  .inputValidator((data: { lat: number; lng: number }) => {
    if (typeof data?.lat !== "number" || typeof data?.lng !== "number") {
      throw new Error("Invalid coordinates");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ name: string; address: string }> => {
    const res = await fetch(
      `${MAPS_API}/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=en&key=${encodeURIComponent(googleKey())}`,
    );
    if (!res.ok) await fail(res, "Reverse geocode");
    const json = (await res.json()) as {
      results?: { formatted_address?: string; address_components?: { long_name?: string }[] }[];
    };
    const first = json.results?.[0];
    const address = first?.formatted_address ?? "";
    const name = first?.address_components?.[1]?.long_name
      ? `${first.address_components[0]?.long_name ?? ""} ${first.address_components[1]?.long_name ?? ""}`.trim()
      : address || "Dropped pin";
    return { name: name || "Dropped pin", address };
  });
