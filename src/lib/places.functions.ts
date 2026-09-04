import { createServerFn } from "@tanstack/react-start";
import { googleKey, googleFail, PLACES_API } from "@/lib/google-api";

export interface NearbyPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  rating?: number;
  distanceMeters?: number;
}

// Google Places API (New) category shortcuts
const TYPE_MAP: Record<string, string[]> = {
  gas: ["gas_station"],
  supercharger: ["electric_vehicle_charging_station"],
  food: ["restaurant"],
  coffee: ["cafe"],
  parking: ["parking"],
};

export const searchNearby = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      lat: number;
      lng: number;
      category: string;
      radiusMeters?: number;
      textQuery?: string;
    }) => {
      if (typeof data?.lat !== "number" || typeof data?.lng !== "number") {
        throw new Error("Invalid coordinates");
      }
      return data;
    },
  )
  .handler(async ({ data }): Promise<{ places: NearbyPlace[] }> => {
    const useText = data.category === "supercharger" || !!data.textQuery;
    const url = useText
      ? `${PLACES_API}/places:searchText`
      : `${PLACES_API}/places:searchNearby`;

    const body = useText
      ? {
          textQuery: data.textQuery ?? "Tesla Supercharger",
          locationBias: {
            circle: {
              center: { latitude: data.lat, longitude: data.lng },
              radius: data.radiusMeters ?? 25000,
            },
          },
          maxResultCount: 10,
        }
      : {
          includedTypes: TYPE_MAP[data.category] ?? [data.category],
          maxResultCount: 10,
          locationRestriction: {
            circle: {
              center: { latitude: data.lat, longitude: data.lng },
              radius: data.radiusMeters ?? 4000,
            },
          },
          rankPreference: "DISTANCE",
        };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error(`Places API failed [${res.status}]: ${t}`);
      throw new Error(`Places API failed [${res.status}]`);
    }

    const json = (await res.json()) as {
      places?: {
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        rating?: number;
      }[];
    };

    const places: NearbyPlace[] = [];
    for (const p of json.places ?? []) {
      if (!p.id || !p.location?.latitude || !p.location?.longitude) continue;
      const lat = p.location.latitude;
      const lng = p.location.longitude;
      const dLat = ((lat - data.lat) * Math.PI) / 180;
      const dLng = ((lng - data.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((data.lat * Math.PI) / 180) *
          Math.cos((lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const distanceMeters = 2 * 6371000 * Math.asin(Math.sqrt(a));
      places.push({
        id: p.id,
        name: p.displayName?.text ?? "Place",
        lat,
        lng,
        address: p.formattedAddress,
        rating: p.rating,
        distanceMeters,
      });
    }
    places.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
    return { places };
  });