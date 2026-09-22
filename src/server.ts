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
// Machine-to-machine payment endpoints stay on the old host forever, because
// provider records created before the cutover still point at them.
const LEGACY_HOSTS = new Set([
  "teslanavi.online",
  "www.teslanavi.online",
  // www of the canonical domain folds into the bare canonical host.
  "www.tmap.ge",
]);
const CANONICAL_HOST = "tmap.ge";
const LEGACY_API_PATHS = new Set([
  "/api/public/payments/bog/callback",
  "/api/public/payments/bog/process-renewals",
  "/api/public/payments/webhook",
]);

export function legacyRedirectTarget(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!LEGACY_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (LEGACY_API_PATHS.has(url.pathname.replace(/\/+$/, "") || "/")) return null;
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";
  return url.toString();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const redirectTo = legacyRedirectTarget(request.url);
      if (redirectTo) return Response.redirect(redirectTo, 301);

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
