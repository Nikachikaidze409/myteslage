import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the project-owned Google Maps browser API key.
 *
 * One key powers the whole app (map display, search, routing), so what the
 * driver sees always matches what Google returns.
 */
export const getMapsBrowserKey = createServerFn({ method: "GET" }).handler(
  async () => {
    const own = process.env["GOOGLE_API_KEY"];
    return { key: own && own.trim() ? own.trim() : null };
  },
);
