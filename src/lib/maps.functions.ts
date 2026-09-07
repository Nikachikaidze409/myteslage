import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the project-owned Google Maps BROWSER API key.
 *
 * This key is only allowed to load the Maps JavaScript API and is protected by
 * HTTP referrer restrictions in Google Cloud. The server key (Routes, Places,
 * Roads, Geocoding) is never returned here.
 */
export const getMapsBrowserKey = createServerFn({ method: "GET" }).handler(
  async () => {
    const browser =
      process.env["GOOGLE_MAPS_BROWSER_KEY"] ??
      // Legacy single-key setup, kept so existing deployments keep working.
      process.env["GOOGLE_API_KEY"];
    return { key: browser && browser.trim() ? browser.trim() : null };
  },
);
