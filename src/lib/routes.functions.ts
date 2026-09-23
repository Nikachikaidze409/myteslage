import { createServerFn } from "@tanstack/react-start";
import { requireMapAccess } from "@/lib/map-access.middleware";
import { googleKey, ROUTES_API } from "@/lib/google-api";
import {
  normalizeRouteFingerprint,
  rateLimitMessage,
  validateRouteInput,
} from "@/lib/route-guard";


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
}

export interface RoutesResponse {
  routes: RouteResult[];
}

export type AvoidOption = "highways" | "ferries";

/** Why this route is being asked for. Drives how much Google work we pay for. */
export type RoutePurposeInput = "user" | "reroute" | "traffic";

/** Input check for computeRoute (shared with the mobile API). */
export const computeRouteInput = (data: {
  origin: LatLng;
  destination: LatLng;
  waypoints?: LatLng[];
  avoid?: AvoidOption[];
  alternatives?: boolean;
  avoidUnpaved?: boolean;
  purpose?: RoutePurposeInput;
}) => {
  // Strict server-side validation: finite in-range coordinates, capped
  // waypoints, and a purpose from the fixed allow-list.
  validateRouteInput(data);
  return data;
};

/** computeRoute without the RPC wrapper, so the mobile API can call it too. */
export async function computeRouteCore(
  data: ReturnType<typeof computeRouteInput>,
  userId: string | null,
): Promise<RoutesResponse> {
    const validated = validateRouteInput(data);
    const purpose = validated.purpose;


    const { claimRouteRequest, hashFingerprint, logRouteEvent } = await import(
      "@/lib/route-guard.server"
    );
    const fingerprintHash = await hashFingerprint(normalizeRouteFingerprint(validated));

    // Cost guard: atomic, database-backed, before any paid call.
    const verdict = userId
      ? await claimRouteRequest(userId, purpose, fingerprintHash)
      : { decision: "allowed" as const, reason: "no_user", retryAfterMs: 0 };

    if (verdict.decision !== "allowed") {
      await logRouteEvent({
        userId,
        purpose,
        fingerprintHash,
        decision: verdict.decision,
        reason: verdict.reason,
        googleCalled: false,
      });
      throw new Error(rateLimitMessage(verdict.retryAfterMs));
    }

    // Mirror Google Maps: only apply modifiers the driver explicitly asked for.
    const modifiers: Record<string, boolean> = {};
    for (const a of data.avoid ?? []) {
      if (a === "highways") modifiers.avoidHighways = true;
      if (a === "ferries") modifiers.avoidFerries = true;
    }

    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetch(
        `${ROUTES_API}/directions/v2:computeRoutes`,
        {
          method: "POST",
          headers: {
            "X-Goog-Api-Key": googleKey(),
            "Content-Type": "application/json",
            "X-Goog-FieldMask":
              "routes.distanceMeters,routes.duration,routes.description,routes.routeLabels,routes.warnings,routes.polyline.encodedPolyline,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.polyline.encodedPolyline",
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
            // Only the driver's own first/changed route pays for the optimal
            // traffic model; reroutes and background ETA refreshes use the
            // cheaper traffic-aware model and never ask for alternatives.
            routingPreference: purpose === "user" ? "TRAFFIC_AWARE_OPTIMAL" : "TRAFFIC_AWARE",
            computeAlternativeRoutes: purpose === "user" && !!data.alternatives,
            ...(Object.keys(modifiers).length ? { routeModifiers: modifiers } : {}),
          }),

        },
      );
    } catch (e) {
      await logRouteEvent({
        userId,
        purpose,
        fingerprintHash,
        decision: "allowed",
        reason: "google_network_error",
        googleCalled: true,
        googleStatus: null,
        durationMs: Date.now() - startedAt,
      });
      throw e;
    }

    await logRouteEvent({
      userId,
      purpose,
      fingerprintHash,
      decision: "allowed",
      reason: res.ok ? "google_success" : "google_failure",
      googleCalled: true,
      googleStatus: res.status,
      durationMs: Date.now() - startedAt,
    });

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