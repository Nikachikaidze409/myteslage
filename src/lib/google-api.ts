// Direct Google Maps Platform access using the project's own API key.
// No proxy or gateway sits in between: every server-side Maps call
// (Places, Routes, Roads, Geocoding) goes straight to Google.

/** The project-owned Google Maps key. Read inside handlers only. */
export function googleKey(): string {
  const k = process.env["GOOGLE_API_KEY"] ?? process.env["GOOGLE_MAPS_SERVER_KEY"];
  if (!k || !k.trim()) throw new Error("Google Maps API key is not configured");
  return k.trim();
}

export const PLACES_API = "https://places.googleapis.com/v1";
export const ROUTES_API = "https://routes.googleapis.com";
export const ROADS_API = "https://roads.googleapis.com";
export const MAPS_API = "https://maps.googleapis.com";

/** Surface Google's own message instead of a silent failure. */
export async function googleFail(res: Response, what: string): Promise<never> {
  const body = await res.text();
  console.error(`${what} failed [${res.status}]: ${body}`);

  if (res.status === 403 && /has not been used in project|is disabled/i.test(body)) {
    const api = /Places API \(New\)|Routes API|Roads API|Geocoding API|Maps JavaScript API/i.exec(body)?.[0] ?? "This Google API";
    throw new Error(
      `${api} is turned off in your Google Cloud project. Enable it in Google Cloud Console (APIs & Services > Library), then try again in a few minutes.`,
    );
  }
  if (res.status === 403) {
    throw new Error(
      `Google refused this request (403). Check your API key's restrictions in Google Cloud Console.`,
    );
  }

  throw new Error(`${what} failed [${res.status}]: ${body.slice(0, 300)}`);
}

