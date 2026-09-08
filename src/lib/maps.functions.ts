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
    // Priority: the project's own teslanavi key first, then the Lovable
    // managed key, then the legacy project key. The SERVER key is never
    // returned to the browser.
    const browser =
      process.env["TESLANAVI_BROWSER_KEY"] ??
      process.env["GOOGLE_MAPS_BROWSER_KEY"] ??
      process.env["GOOGLE_API_KEY"];
    return { key: browser && browser.trim() ? browser.trim() : null };
  },
);
