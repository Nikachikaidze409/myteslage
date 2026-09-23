import { createServerFn } from "@tanstack/react-start";
import { requireMapAccess } from "@/lib/map-access.middleware";
import { z } from "zod";

import { googleKey, ROADS_API } from "@/lib/google-api";

const InputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

/** Input check for snapToRoad (shared with the mobile API). */
export const snapToRoadInput = (data: unknown) => InputSchema.parse(data);

/** snapToRoad without the RPC wrapper, so the mobile API can call it too. */
export async function snapToRoadCore(data: ReturnType<typeof snapToRoadInput>) {
  const path = `${data.lat},${data.lng}`;
  const res = await fetch(
    `${ROADS_API}/v1/nearestRoads?points=${encodeURIComponent(path)}&key=${encodeURIComponent(googleKey())}`,
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
}

export const snapToRoad = createServerFn({ method: "POST" })
  .middleware([requireMapAccess])
  .inputValidator(snapToRoadInput)
  .handler(({ data }) => snapToRoadCore(data));
