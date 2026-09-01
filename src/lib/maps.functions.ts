import { createServerFn } from "@tanstack/react-start";

/**
 * Returns a Google Maps browser API key to the client.
 *
 * Prefers the project-owned key (GOOGLE_API_KEY secret), which is referrer-restricted
 * to the project's domains. Falls back to the Lovable-managed connector browser key,
 * which is only authorized on *.lovable.app domains.
 *
 * Browser keys are HTTP-referrer restricted, so exposing them to the client is safe:
 * Google only honors the key on the domains authorized in the Google Cloud Console.
 */
export const getMapsBrowserKey = createServerFn({ method: "GET" }).handler(
  async () => {
    const own = process.env["GOOGLE_API_KEY"];
    const connector = process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
    const key = own && own.trim() ? own.trim() : connector;
    return { key: key ?? null };
  },
);
