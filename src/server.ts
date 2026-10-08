import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} - try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Legacy domain cutover: teslanavi.online -> tmap.ge.
// The legacy host is redirect-only: it never runs application or payment logic.
// Browser reads move with 301; anything else (a late provider POST) moves with
// 308 so the method, headers and body survive the hop.
const LEGACY_HOSTS = new Set([
  "teslanavi.online",
  "www.teslanavi.online",
  // www of the canonical domain folds into the bare canonical host.
  "www.tmap.ge",
]);
const CANONICAL_HOST = "tmap.ge";

/** The Armenian storefront: landing + checkout only, the map lives on tmap.ge. */
const AM_HOST = "tmap.am";
/** Everything that must always run on the canonical Georgian host. */
const APP_ONLY_PATHS = ["/map", "/phone", "/pair"];

export function legacyRedirectTarget(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  // www of the Armenian domain folds into the bare Armenian host.
  if (host === `www.${AM_HOST}`) {
    url.protocol = "https:";
    url.hostname = AM_HOST;
    url.port = "";
    return url.toString();
  }

  // The car session, QR pairing and the map itself only ever run on tmap.ge.
  if (host === AM_HOST && APP_ONLY_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
    url.protocol = "https:";
    url.hostname = CANONICAL_HOST;
    url.port = "";
    url.searchParams.set("from", "am");
    return url.toString();
  }

  if (!LEGACY_HOSTS.has(host)) return null;
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";
  return url.toString();
}

/** Shop pages an Armenian visitor on tmap.ge is sent back to tmap.am for. */
const AM_SHOP_PATHS = new Set(["/", "/pricing", "/checkout", "/hy", "/en", "/ru", "/az"]);
export const AM_VISITOR_COOKIE = "tmap_am";

/**
 * Armenian visitors (Armenian IP, or a browser that came over from tmap.am)
 * see only tmap.am prices: tmap.ge shop pages redirect to tmap.am. The map,
 * sign-in and payment returns on tmap.ge stay reachable.
 */
export function armenianRedirectTarget(
  rawUrl: string,
  method: string,
  country: string | null,
  cookieHeader: string | null,
): string | null {
  if (method.toUpperCase() !== "GET") return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== CANONICAL_HOST) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!AM_SHOP_PATHS.has(path)) return null;
  const remembered = new RegExp(`(?:^|;\\s*)${AM_VISITOR_COOKIE}=1`).test(cookieHeader ?? "");
  if (!remembered && (country ?? "").toUpperCase() !== "AM") return null;
  return `https://${AM_HOST}${path === "/hy" || path === "/en" || path === "/ru" || path === "/az" ? "/" : path}`;
}

/** Path on tmap.ge that stores the tmap_am cookie and bounces back to tmap.am. */
export const AM_SYNC_PATH = "/__am-sync";
const AM_SYNCED_COOKIE = "tmap_am_synced";
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|preview|lighthouse/i;

/**
 * First visit on tmap.am: bounce once through tmap.ge so tmap.ge can remember
 * this browser as Armenian (cookies cannot be shared across .am and .ge).
 */
export function amSyncTarget(
  rawUrl: string,
  method: string,
  cookieHeader: string | null,
  userAgent: string | null,
): string | null {
  if (method.toUpperCase() !== "GET") return null;
  if (BOT_UA.test(userAgent ?? "")) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== AM_HOST) return null;
  if (url.pathname.startsWith("/api/") || url.searchParams.has("am_synced")) return null;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!AM_SHOP_PATHS.has(path)) return null;
  if (new RegExp(`(?:^|;\\s*)${AM_SYNCED_COOKIE}=1`).test(cookieHeader ?? "")) return null;
  url.protocol = "https:";
  url.port = "";
  return `https://${CANONICAL_HOST}${AM_SYNC_PATH}?back=${encodeURIComponent(url.toString())}`;
}

/** Only ever bounce back to tmap.am. */
export function amSyncBack(rawUrl: string): string {
  try {
    const back = new URL(new URL(rawUrl).searchParams.get("back") ?? "");
    if (back.hostname.toLowerCase() !== AM_HOST) throw new Error("bad host");
    back.protocol = "https:";
    back.searchParams.set("am_synced", "1");
    return back.toString();
  } catch {
    return `https://${AM_HOST}/?am_synced=1`;
  }
}

function countryOf(request: Request): string | null {
  const cf = (request as unknown as { cf?: { country?: string } }).cf;
  return request.headers.get("cf-ipcountry") || cf?.country || null;
}

/** 301 for browser reads, 308 for everything else so POST bodies survive. */
export function legacyRedirectStatus(method: string): 301 | 308 {
  const verb = method.toUpperCase();
  return verb === "GET" || verb === "HEAD" ? 301 : 308;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const redirectTo = legacyRedirectTarget(request.url);
      if (redirectTo) {
        return new Response(null, {
          status: legacyRedirectStatus(request.method),
          headers: { location: redirectTo },
        });
      }

      const reqUrl = new URL(request.url);
      // tmap.ge side of the handshake: remember the browser, bounce back.
      if (reqUrl.hostname.toLowerCase() === CANONICAL_HOST && reqUrl.pathname === AM_SYNC_PATH) {
        const headers = new Headers({ location: amSyncBack(request.url), "cache-control": "no-store" });
        headers.append("set-cookie", `${AM_VISITOR_COOKIE}=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax`);
        return new Response(null, { status: 302, headers });
      }

      const syncTo = amSyncTarget(
        request.url,
        request.method,
        request.headers.get("cookie"),
        request.headers.get("user-agent"),
      );
      if (syncTo) {
        return new Response(null, { status: 302, headers: { location: syncTo, "cache-control": "no-store" } });
      }

      const amTarget = armenianRedirectTarget(
        request.url,
        request.method,
        countryOf(request),
        request.headers.get("cookie"),
      );
      if (amTarget) {
        return new Response(null, { status: 302, headers: { location: amTarget, "cache-control": "no-store" } });
      }

      if (reqUrl.hostname.toLowerCase() === AM_HOST && reqUrl.searchParams.get("am_synced") === "1") {
        const handler = await getServerEntry();
        const res = await normalizeCatastrophicSsrResponse(await handler.fetch(request, env, ctx));
        const withCookie = new Response(res.body, res);
        withCookie.headers.append(
          "set-cookie",
          `${AM_SYNCED_COOKIE}=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax`,
        );
        return withCookie;
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      // A browser sent over from tmap.am is remembered on tmap.ge for a year.
      if (new URL(request.url).searchParams.get("from") === "am") {
        const withCookie = new Response(normalized.body, normalized);
        withCookie.headers.append(
          "set-cookie",
          `${AM_VISITOR_COOKIE}=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax`,
        );
        return withCookie;
      }
      return normalized;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
