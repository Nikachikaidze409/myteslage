import { createFileRoute } from "@tanstack/react-router";
import {
  MAX_BODY_BYTES,
  MOBILE_API_VERSION,
  errorResponseFor,
  isPairCode,
  type MobileErrorBody,
} from "@/lib/mobile-api";

/**
 * TMap Georgia mobile app API. Every endpoint except `config` needs the
 * pairing code from the car's QR in the `x-pair-code` header — exactly the
 * access rule the web phone page has today.
 *
 *   GET  config            public settings (Supabase realtime, min app version)
 *   GET  session           is this pairing code usable? { valid, expiresAt }
 *   POST autocomplete      { query, lat?, lng? }
 *   POST place-details     { placeId }
 *   POST reverse-geocode   { lat, lng }
 *   POST nearby            { lat, lng, category, radiusMeters?, textQuery? }
 *   POST resolve-link      { text, lat?, lng? }
 *   POST snap              { lat, lng }
 *   POST route             { origin, destination, waypoints?, avoid?, alternatives?, purpose? }
 *   POST transcribe        { audio }  (base64 WAV)
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const fail = (status: number, error: MobileErrorBody["error"], message: string) =>
  json({ error, message } satisfies MobileErrorBody, status);

type Handler = (data: unknown, userId: string) => Promise<unknown>;

/** Each entry: the same validator + core logic the web server function uses. */
const POST_HANDLERS: Record<string, () => Promise<Handler>> = {
  autocomplete: async () => {
    const m = await import("@/lib/search.functions");
    return (d) => m.autocompletePlacesCore(m.autocompletePlacesInput(d as never));
  },
  "place-details": async () => {
    const m = await import("@/lib/search.functions");
    return (d) => m.placeDetailsCore(m.placeDetailsInput(d as never));
  },
  "reverse-geocode": async () => {
    const m = await import("@/lib/search.functions");
    return (d) => m.reverseGeocodeCore(m.reverseGeocodeInput(d as never));
  },
  nearby: async () => {
    const m = await import("@/lib/places.functions");
    return (d) => m.searchNearbyCore(m.searchNearbyInput(d as never));
  },
  "resolve-link": async () => {
    const m = await import("@/lib/place-link.functions");
    return (d) => m.resolvePastedLocationCore(m.resolvePastedLocationInput(d as never));
  },
  snap: async () => {
    const m = await import("@/lib/snap-to-road.functions");
    return (d) => m.snapToRoadCore(m.snapToRoadInput(d));
  },
  route: async () => {
    const m = await import("@/lib/routes.functions");
    // userId feeds the same per-account route cost guard as the web page.
    return (d, userId) => m.computeRouteCore(m.computeRouteInput(d as never), userId);
  },
  transcribe: async () => {
    const m = await import("@/lib/voice.functions");
    return (d) => m.transcribeDestinationCore(m.transcribeDestinationInput(d as never));
  },
};

type Authorized =
  | { res: Response }
  | { check: { ok: true; userId: string; expiresAt: string } };

async function authorize(request: Request): Promise<Authorized> {
  const code = request.headers.get("x-pair-code");
  if (!isPairCode(code)) {
    return { res: fail(401, "unauthorized", "Scan the QR code on the car screen again.") };
  }
  const { checkPairCode } = await import("@/lib/mobile-api.server");
  const check = await checkPairCode(code);
  if (!check.ok) {
    return check.reason === "membership_inactive"
      ? { res: fail(403, "membership_inactive", "The car owner's membership is not active.") }
      : { res: fail(401, "unauthorized", "This pairing code has expired. Scan the QR code again.") };
  }
  return { check };
}

export const Route = createFileRoute("/api/public/mobile/v1/$action")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const action = (params as { action?: string }).action;

        if (action === "config") {
          return json({
            apiVersion: MOBILE_API_VERSION,
            supabaseUrl: process.env["SUPABASE_URL"] ?? null,
            supabaseKey: process.env["SUPABASE_PUBLISHABLE_KEY"] ?? null,
            // Raise to force old app builds to show "please update".
            minAppVersion: process.env["MOBILE_MIN_APP_VERSION"] ?? "1.0.0",
          });
        }

        if (action === "session") {
          const auth = await authorize(request);
          if ("res" in auth) {
            const body = (await auth.res.clone().json()) as MobileErrorBody;
            return json({ valid: false, ...body }, auth.res.status);
          }
          return json({ valid: true, expiresAt: auth.check.expiresAt });
        }

        return fail(404, "not_found", "Unknown endpoint");
      },

      POST: async ({ request, params }) => {
        const action = (params as { action?: string }).action ?? "";
        const load = POST_HANDLERS[action];
        if (!load) return fail(404, "not_found", "Unknown endpoint");

        const auth = await authorize(request);
        if ("res" in auth) return auth.res;

        const len = Number(request.headers.get("content-length") ?? "0");
        if (len > MAX_BODY_BYTES) return fail(413, "bad_request", "Request is too large");
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) return fail(413, "bad_request", "Request is too large");

        let data: unknown;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          return fail(400, "bad_request", "Body must be JSON");
        }

        try {
          const handler = await load();
          return json(await handler(data, auth.check.userId));
        } catch (e) {
          const { status, body } = errorResponseFor(e);
          if (status >= 500 || body.error === "failed") {
            console.error(`[mobile-api] ${action} failed:`, body.message);
          }
          return json(body, status);
        }
      },
    },
  },
});
