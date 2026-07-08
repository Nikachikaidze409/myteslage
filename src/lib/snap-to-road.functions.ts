import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const InputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const snapToRoad = createServerFn({ method: "POST" })
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !gmKey) throw new Error("Google Maps connector not configured");

    const path = `${data.lat},${data.lng}`;
    const res = await fetch(
      `${GATEWAY_URL}/roads/v1/nearestRoads?points=${encodeURIComponent(path)}`,
      {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmKey,
        },
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Roads API failed [${res.status}]: ${body}`);
    }
    const json = (await res.json()) as {
      snappedPoints?: { location: { latitude: number; longitude: number } }[];
    };
    const p = json.snappedPoints?.[0]?.location;
    if (!p) return { lat: data.lat, lng: data.lng, snapped: false };
    return { lat: p.latitude, lng: p.longitude, snapped: true };
  });