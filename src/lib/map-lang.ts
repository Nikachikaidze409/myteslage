// Map interface language (Georgian default, Armenian and Azerbaijani optional).
// Read once per page load; switching reloads so Google Maps loads natively in that language.
import { AZ_MAP_STRINGS } from "@/lib/map-lang-az";
import { RU_MAP_STRINGS } from "@/lib/map-lang-ru";

export type MapLang = "ka" | "hy" | "az" | "ru";

/** Order the flag button cycles through. */
export const MAP_LANG_CYCLE: readonly MapLang[] = ["ka", "hy", "az", "ru"];

export const MAP_LANG_FLAG: Record<MapLang, string> = { ka: "🇬🇪", hy: "🇦🇲", az: "🇦🇿", ru: "🇷🇺" };

const KEY = "tmg:map-lang";

function read(): MapLang {
  if (typeof window === "undefined") return "ka";
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "hy" || v === "az" || v === "ru" ? v : "ka";
  } catch {
    return "ka";
  }
}

const current: MapLang = read();

export function getMapLang(): MapLang {
  return current;
}

/** The language the flag button switches to next. */
export function nextMapLang(lang: MapLang): MapLang {
  const i = MAP_LANG_CYCLE.indexOf(lang);
  return MAP_LANG_CYCLE[(i + 1) % MAP_LANG_CYCLE.length]!;
}

export function setMapLang(lang: MapLang): void {
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    /* storage disabled */
  }
  window.location.reload();
}

/** Pick the string for the active map language (Azerbaijani looked up by the Georgian text). */
export function tr(ka: string, hy: string): string {
  if (current === "hy") return hy;
  if (current === "az") return AZ_MAP_STRINGS[ka] ?? ka;
  if (current === "ru") return RU_MAP_STRINGS[ka] ?? ka;
  return ka;
}
