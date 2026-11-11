import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AccountMenu } from "@/components/AccountMenu";
import { HeroScreen, PairingArt, TMapMark } from "@/components/landing/illustrations";
import { useMarket } from "@/lib/market-context";
import { MARKET_BOG_LABELS } from "@/lib/market";

/** Russian landing (tmap.ge/ru): rubles shown large, tenge in brackets. Display only. */
const RU_PRICES = {
  monthly: { price: "450 ₽", sub: "(2 457 ₸)" },
  quarterly: { price: "1 277 ₽", sub: "(13 415 ₸)" },
  annual: { price: "4 792 ₽", sub: "(26 165 ₸)" },
} as const;
/** 6-month card copy for the Georgian storefront (39 ₾). */
const SEMI_COPY = {
  ka: { title: "6 თვე წინასწარ", total: " სულ", sub: "6.50 ₾/თვე", tag: "ერთი გადახდა, ექვსი თვე", cta: "6 თვიანი გეგმა →", features: ["ცოცხალი რუკა მანქანაში", "ტელეფონის GPS დაწყვილება", "ერთი გადახდა, ექვსი თვე", "პრიორიტეტული მხარდაჭერა"] },
  en: { title: "6 months upfront", total: " total", sub: "6.50 ₾/mo", tag: "One payment, six months", cta: "Get 6 months →", features: ["Live in-car map", "Phone GPS pairing", "One payment, six months", "Priority support"] },
  hy: { title: "6 ամիս կանխավճարով", total: " ընդամենը", sub: "6.50 ₾/ամիս", tag: "Մեկ վճարում, վեց ամիս", cta: "6 ամիս →", features: ["Կենդանի քարտեզ մեքենայում", "Հեռախոսի GPS զուգակցում", "Մեկ վճարում, վեց ամիս", "Առաջնահերթ աջակցություն"] },
} as const;
const RU_COOKIE_ON = "tmap_lang=ru; path=/; max-age=31536000; samesite=lax";
const RU_COOKIE_OFF = "tmap_lang=; path=/; max-age=0; samesite=lax";
const MAP_LANG_KEY = "tmg:map-lang";

function syncMapLang(l: Lang) {
  try {
    if (l === "ru") window.localStorage.setItem(MAP_LANG_KEY, "ru");
    else if (window.localStorage.getItem(MAP_LANG_KEY) === "ru") window.localStorage.setItem(MAP_LANG_KEY, "ka");
  } catch {
    /* ignore */
  }
}
import { AM_LANDING_OVERRIDES } from "@/lib/landing-am";
import {
  LANGS,
  LANG_KEY,
  LANG_LABEL,
  SIGN_OUT_LABEL,
  T,
  isLang,
  type Lang,
  type Translation,
} from "@/lib/landing-i18n";

/**
 * Public landing page. `forcedLang` comes from the localized URLs (/en, /hy,
 * /ru); the bare "/" route falls back to Georgian and remembers the visitor's
 * last manual choice. On tmap.am the page is Armenian only, with AMD prices.
 */
export function Landing({ forcedLang }: { forcedLang?: Lang }) {
  const detected = useMarket();
  const market = forcedLang === "az" ? "az" : detected;
  const armenia = market === "am";
  const [signedIn, setSignedIn] = useState(false);
  const [lang, setLang] = useState<Lang>(armenia ? "hy" : (forcedLang ?? "ka"));
  const navigate = useNavigate();

  useEffect(() => {
    if (armenia) return;
    if (!forcedLang && /(?:^|;\s*)tmap_lang=ru/.test(document.cookie)) {
      navigate({ to: "/ru", replace: true });
      return;
    }
    if (forcedLang) {
      if (forcedLang === "ru") document.cookie = RU_COOKIE_ON;
      syncMapLang(forcedLang);
      if (forcedLang === "az") {
        document.cookie = "tmap_market=az; path=/; max-age=31536000; samesite=lax";
      }
      try {
        window.localStorage.setItem(LANG_KEY, forcedLang);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      if (isLang(saved)) setLang(saved);
    } catch {
      /* ignore */
    }
  }, [forcedLang, armenia, navigate]);

  const setLangPersist = (l: Lang) => {
    document.cookie = l === "ru" ? RU_COOKIE_ON : RU_COOKIE_OFF;
    syncMapLang(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
    if (l === "ru") {
      document.cookie = "tmap_market=; path=/; max-age=0; samesite=lax";
      navigate({ to: "/ru" });
      return;
    }
    if (forcedLang === "ru") {
      document.cookie =
        l === "az" ? "tmap_market=az; path=/; max-age=31536000; samesite=lax" : "tmap_market=; path=/; max-age=0; samesite=lax";
      navigate({ to: l === "az" ? "/az" : "/" });
      return;
    }
    setLang(l);
    // Azerbaijani = AZN prices; any other language returns to the GEL market.
    document.cookie =
      l === "az"
        ? "tmap_market=az; path=/; max-age=31536000; samesite=lax"
        : "tmap_market=; path=/; max-age=0; samesite=lax";
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    if (armenia) {
      window.location.replace("https://tmap.ge/hub?from=am");
      return;
    }
    navigate({ to: "/hub", replace: true });
  }, [signedIn, armenia, navigate]);

  const t = (
    armenia ? { ...T.hy, ...AM_LANDING_OVERRIDES } : T[lang]
  ) as unknown as Translation;
  const prices = MARKET_BOG_LABELS[market];
  const ru = !armenia && lang === "ru";
  // Georgia (tmap.ge, not /ru) temporarily sells 3 months / 6 months / 1 year only.
  const georgia = market === "ge" && !ru;
  const semi = SEMI_COPY[lang === "ka" ? "ka" : lang === "hy" ? "hy" : "en"];

