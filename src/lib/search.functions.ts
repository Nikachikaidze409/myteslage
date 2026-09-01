import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export interface PlaceSuggestion {
  placeId: string;
  primary: string;
  secondary: string;
  lat?: number;
  lng?: number;
}

export interface PlaceDetail {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  ratingCount?: number;
  phone?: string;
  website?: string;
  openNow?: boolean;
  hours?: string[];
  category?: string;
  summary?: string;
  photos?: string[];
}

function keys() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableKey || !connKey) throw new Error("Search is not configured");
  return { lovableKey, connKey };
}

function gatewayHeaders(lovableKey: string, connKey: string) {
  return { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey, "Content-Type": "application/json" };
}

async function fail(res: Response, what: string): Promise<never> {
  const body = await res.text();
  console.error(`${what} failed [${res.status}]: ${body}`);
  throw new Error(`${what} failed [${res.status}]: ${body.slice(0, 240)}`);
}

export const autocompletePlaces = createServerFn({ method: "POST" })
  .inputValidator((data: { query: string; lat?: number; lng?: number }) => {
    if (!data || typeof data.query !== "string") throw new Error("Invalid query");
    return data;
  })
  .handler(async ({ data }): Promise<{ suggestions: PlaceSuggestion[] }> => {
    const q = data.query.trim();
    if (q.length < 2) return { suggestions: [] };
    const { lovableKey, connKey } = keys();
    const headers = gatewayHeaders(lovableKey, connKey);
    const bias = typeof data.lat === "number" && typeof data.lng === "number"
      ? { circle: { center: { latitude: data.lat, longitude: data.lng }, radius: 50000 } }
      : undefined;
    const res = await fetch(`${GATEWAY}/places/v1/places:autocomplete`, { method: "POST", headers, body: JSON.stringify({ input: q, includedRegionCodes: ["ge"], ...(bias ? { locationBias: bias } : {}) }) });
    if (!res.ok) await fail(res, "Place autocomplete");
    const json = (await res.json()) as { suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] };
    const suggestions: PlaceSuggestion[] = [];
    for (const s of json.suggestions ?? []) {
      const p = s.placePrediction;
      if (!p?.placeId) continue;
      suggestions.push({ placeId: p.placeId, primary: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "", secondary: p.structuredFormat?.secondaryText?.text ?? "" });
      if (suggestions.length >= 6) break;
    }
    if (suggestions.length > 0) return { suggestions };
    const textRes = await fetch(`${GATEWAY}/places/v1/places:searchText`, { method: "POST", headers: { ...headers, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location" }, body: JSON.stringify({ textQuery: q, regionCode: "GE", maxResultCount: 6, ...(bias ? { locationBias: bias } : {}) }) });
    if (!textRes.ok) await fail(textRes, "Place search");
    const tj = (await textRes.json()) as { places?: { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }[] };
    for (const p of tj.places ?? []) {
      if (!p.id) continue;
      suggestions.push({ placeId: p.id, primary: p.displayName?.text ?? p.formattedAddress ?? "", secondary: p.formattedAddress ?? "", lat: p.location?.latitude, lng: p.location?.longitude });
    }
    return { suggestions };
  });

export const placeDetails = createServerFn({ method: "POST" })
  .inputValidator((data: { placeId: string }) => { if (!data?.placeId) throw new Error("Invalid place"); return data; })
  .handler(async ({ data }): Promise<PlaceDetail> => {
    const { lovableKey, connKey } = keys();
    const res = await fetch(`${GATEWAY}/places/v1/places/${encodeURIComponent(data.placeId)}`, { headers: { ...gatewayHeaders(lovableKey, connKey), "X-Goog-FieldMask": "id,displayName,formattedAddress,location,rating,userRatingCount,nationalPhoneNumber,websiteUri,currentOpeningHours,regularOpeningHours,primaryTypeDisplayName,primaryType,editorialSummary,photos" } });
    if (!res.ok) await fail(res, "Place details");
    const p = (await res.json()) as { id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number }; rating?: number; userRatingCount?: number; nationalPhoneNumber?: string; websiteUri?: string; currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] }; regularOpeningHours?: { weekdayDescriptions?: string[] }; primaryTypeDisplayName?: { text?: string }; photos?: { name?: string }[]; primaryType?: string; editorialSummary?: { text?: string } };
    if (typeof p.location?.latitude !== "number" || typeof p.location?.longitude !== "number") throw new Error("Place has no location");
    return { placeId: p.id ?? data.placeId, name: p.displayName?.text ?? p.formattedAddress ?? "Destination", address: p.formattedAddress ?? "", lat: p.location.latitude, lng: p.location.longitude, rating: p.rating, ratingCount: p.userRatingCount, phone: p.nationalPhoneNumber, website: p.websiteUri, openNow: p.currentOpeningHours?.openNow, hours: p.currentOpeningHours?.weekdayDescriptions ?? p.regularOpeningHours?.weekdayDescriptions, category: p.primaryTypeDisplayName?.text ?? p.primaryType, summary: p.editorialSummary?.text, photos: p.photos?.map((photo) => photo.name).filter((name): name is string => Boolean(name)) };
  });

export const placePhoto = createServerFn({ method: "POST" })
  .inputValidator((data: { photoName: string }) => { if (!data?.photoName || data.photoName.length > 500) throw new Error("Invalid photo"); return data; })
  .handler(async ({ data }): Promise<{ dataUri: string }> => {
    const { lovableKey, connKey } = keys();
    const res = await fetch(`${GATEWAY}/places/v1/${data.photoName}/media?maxWidthPx=900&maxHeightPx=480`, { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey } });
    if (!res.ok) await fail(res, "Place photo");
    const type = res.headers.get("content-type") ?? "image/jpeg";
    const bytes = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { dataUri: `data:${type};base64,${btoa(binary)}` };
  });

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator((data: { lat: number; lng: number }) => { if (typeof data?.lat !== "number" || typeof data?.lng !== "number") throw new Error("Invalid coordinates"); return data; })
  .handler(async ({ data }): Promise<{ name: string; address: string }> => {
    const { lovableKey, connKey } = keys();
    const res = await fetch(`${GATEWAY}/maps/api/geocode/json?latlng=${data.lat},${data.lng}&language=en`, { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey } });
    if (!res.ok) await fail(res, "Reverse geocode");
    const json = (await res.json()) as { results?: { formatted_address?: string; address_components?: { long_name?: string }[] }[] };
    const first = json.results?.[0];
    const address = first?.formatted_address ?? "";
    const name = first?.address_components?.[1]?.long_name ? `${first.address_components[0]?.long_name ?? ""} ${first.address_components[1]?.long_name ?? ""}`.trim() : address || "Dropped pin";
    return { name: name || "Dropped pin", address };
  });
