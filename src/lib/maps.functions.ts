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
    // The project's own key comes first: it is the one allowed on
    // teslanavi.online. GOOGLE_MAPS_BROWSER_KEY is the Lovable-managed key,
    // which Google only accepts on *.lovable.app, so it is a fallback.
    const browser =
      process.env["GOOGLE_API_KEY"] ??
      process.env["GOOGLE_MAPS_BROWSER_KEY"];
    return { key: browser && browser.trim() ? browser.trim() : null };
  },
);
