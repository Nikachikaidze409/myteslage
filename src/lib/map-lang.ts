// Map interface language (Georgian default, Armenian optional).
// Read once per page load; switching reloads so Google Maps loads natively in that language.
export type MapLang = "ka" | "hy";

const KEY = "tmg:map-lang";

function read(): MapLang {
  if (typeof window === "undefined") return "ka";
  try {
    return window.localStorage.getItem(KEY) === "hy" ? "hy" : "ka";
  } catch {
    return "ka";
  }
}

const current: MapLang = read();

export function getMapLang(): MapLang {
  return current;
}

export function setMapLang(lang: MapLang): void {
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    /* storage disabled */
  }
  window.location.reload();
}

/** Pick the Georgian or Armenian string for the active map language. */
export function tr(ka: string, hy: string): string {
  return current === "hy" ? hy : ka;
}
