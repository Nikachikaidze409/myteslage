import { createServerFn } from "@tanstack/react-start";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
}

export const computeRoute = createServerFn({ method: "POST" })
  .inputValidator((data: { origin: LatLng; destination: LatLng }) => {
    if (
      !data ||
      typeof data.origin?.lat !== "number" ||
      typeof data.origin?.lng !== "number" ||
      typeof data.destination?.lat !== "number" ||
      typeof data.destination?.lng !== "number"
    ) {
      throw new Error("Invalid coordinates");
    }
    return data;
  })
  .handler(async ({ data }): Promise<RouteResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !connKey) throw new Error("Google Maps connector not configured");

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: data.origin.lat, longitude: data.origin.lng } } },
          destination: {
            location: { latLng: { latitude: data.destination.lat, longitude: data.destination.lng } },
          },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`Routes API failed [${res.status}]: ${body}`);
      throw new Error(`Routes API failed [${res.status}]: ${body}`);
    }

    const json = (await res.json()) as {
      routes?: { distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }[];
    };
    const r = json.routes?.[0];
    if (!r?.polyline?.encodedPolyline) throw new Error("No route found");
    const durationSeconds = r.duration ? parseInt(r.duration.replace("s", ""), 10) : 0;
    return {
      distanceMeters: r.distanceMeters ?? 0,
      durationSeconds,
      encodedPolyline: r.polyline.encodedPolyline,
    };
  });