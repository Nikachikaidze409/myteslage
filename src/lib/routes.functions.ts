import { createServerFn } from "@tanstack/react-start";
import { googleKey, ROUTES_API } from "@/lib/google-api";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  polyline: string;
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  steps: RouteStep[];
  label?: string;
  warnings?: string[];
  hasTolls?: boolean;
}

export interface RoutesResponse {
  routes: RouteResult[];
}

export type AvoidOption = "tolls" | "highways" | "ferries";

export const computeRoute = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      origin: LatLng;
      destination: LatLng;
      waypoints?: LatLng[];
      avoid?: AvoidOption[];
      alternatives?: boolean;
      avoidUnpaved?: boolean;
    }) => {
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
  .handler(async ({ data }): Promise<RoutesResponse> => {
    // Mirror Google Maps: only apply modifiers the driver explicitly asked for.
    const modifiers: Record<string, boolean> = {};
    for (const a of data.avoid ?? []) {
      if (a === "tolls") modifiers.avoidTolls = true;
      if (a === "highways") modifiers.avoidHighways = true;
      if (a === "ferries") modifiers.avoidFerries = true;
    }

    const res = await fetch(
      `${ROUTES_API}/directions/v2:computeRoutes`,
      {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": googleKey(),
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.description,routes.routeLabels,routes.warnings,routes.travelAdvisory,routes.polyline.encodedPolyline,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.polyline.encodedPolyline",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: data.origin.lat, longitude: data.origin.lng } } },
          destination: {
            location: { latLng: { latitude: data.destination.lat, longitude: data.destination.lng } },
          },
          intermediates: (data.waypoints ?? []).map((w) => ({
            location: { latLng: { latitude: w.lat, longitude: w.lng } },
          })),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE_OPTIMAL",
          computeAlternativeRoutes: !!data.alternatives,
          extraComputations: ["TOLLS"],
          ...(Object.keys(modifiers).length ? { routeModifiers: modifiers } : {}),
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`Routes API failed [${res.status}]: ${body}`);
      throw new Error(`Routes API failed [${res.status}]: ${body}`);
    }

    const json = (await res.json()) as {
      routes?: {
        distanceMeters?: number;
        duration?: string;
        description?: string;
        routeLabels?: string[];
        warnings?: string[];
        travelAdvisory?: { tollInfo?: unknown };
        polyline?: { encodedPolyline?: string };
        legs?: {
          steps?: {
            distanceMeters?: number;
            navigationInstruction?: { instructions?: string };
            polyline?: { encodedPolyline?: string };
          }[];
        }[];
      }[];
    };
    if (!json.routes?.length) throw new Error("No route found");
    const routes: RouteResult[] = [];
    for (const r of json.routes) {
      if (!r.polyline?.encodedPolyline) continue;
      const durationSeconds = r.duration ? parseInt(r.duration.replace("s", ""), 10) : 0;
      const steps: RouteStep[] = [];
      for (const leg of r.legs ?? []) {
        for (const s of leg.steps ?? []) {
          steps.push({
            instruction: s.navigationInstruction?.instructions ?? "Continue",
            distanceMeters: s.distanceMeters ?? 0,
            polyline: s.polyline?.encodedPolyline ?? "",
          });
        }
      }
      const label =
        r.routeLabels?.includes("DEFAULT_ROUTE")
          ? "Fastest"
          : r.routeLabels?.includes("FUEL_EFFICIENT")
          ? "Eco"
          : r.description ?? "Alternate";
      routes.push({
        distanceMeters: r.distanceMeters ?? 0,
        durationSeconds,
        encodedPolyline: r.polyline.encodedPolyline,
        steps,
        label,
        warnings: r.warnings ?? [],
        hasTolls: !!r.travelAdvisory?.tollInfo,
      });
    }
    if (!routes.length) throw new Error("No route found");
    // Match the Google Maps app: its recommended (DEFAULT_ROUTE) result comes first and
    // is what the driver gets. Alternatives keep Google's own ordering. No post-filtering.
    const defaultIdx = routes.findIndex((r) => r.label === "Fastest");
    if (defaultIdx > 0) {
      const [primary] = routes.splice(defaultIdx, 1);
      routes.unshift(primary);
    }
    return { routes };
  });