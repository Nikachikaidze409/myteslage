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

  const brand =
    market === "am" || lang === "hy"
      ? "TMap Armenia"
      : market === "az"
        ? "TMap Azerbaijan"
        : lang === "ru"
          ? "TMap"
          : "TMap Georgia";

  return (
    <div className="min-h-screen bg-[#050708] text-white" lang={lang}>
      <Nav signedIn={signedIn} t={t} lang={lang} onLang={setLangPersist} armenia={armenia} />

      {/* HERO */}
      <section className="relative border-b border-white/[0.06]">
        <div className="mx-auto grid max-w-[1440px] items-center gap-8 px-5 pb-8 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12 lg:pt-10">
          <div className="min-w-0">
            <div className="mb-4 inline-flex max-w-full items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e9b149]">
              <span className="h-px w-6 shrink-0 bg-[#e9b149]" />
              <span className="break-words">{t.heroBadge}</span>
            </div>
            <h1 className="font-display break-words text-[2.1rem] font-black leading-[1.05] tracking-tight sm:text-5xl xl:text-6xl">
              {t.heroTitle1}
              <br />
              {t.heroTitle2} <span className="text-[#e9b149]">{t.heroTitle3}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">{t.heroBody}</p>
            <Link
              to="/pricing"
              className="font-display group mt-7 inline-flex min-h-14 items-center justify-center rounded-xl bg-[#3b82f6] px-8 py-3 text-base font-bold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9b149] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050708]"
            >
              {t.heroCta}
              <span className="ml-2 transition group-hover:translate-x-1" aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="min-w-0">
            <HeroScreen label={t.heroImgAlt} />
          </div>
        </div>

        {/* trip readout */}
        <dl className="mx-auto grid max-w-[1440px] grid-cols-1 border-t border-white/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-white/10">
          <Stat n={t.stat1} l={t.stat1l} />
          <Stat n={t.stat2} l={t.stat2l} />
          <Stat n={t.stat3} l={t.stat3l} />
        </dl>
      </section>

      {/* PROBLEM / SOLUTION */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <div className="grid overflow-hidden rounded-2xl border border-white/10 md:grid-cols-2">
            <ComparePane tone="bad" eyebrow={t.badEyebrow} title={t.badTitle} bullets={t.badBullets} />
            <ComparePane tone="good" eyebrow={t.goodEyebrow} title={t.goodTitle} bullets={t.goodBullets} />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="pb-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <h2 className="font-display max-w-3xl break-words text-3xl font-black leading-tight sm:text-4xl md:text-5xl">
            {t.featuresTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-white/70">{t.featuresBody}</p>

          <div className="mt-10 grid grid-flow-dense gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {t.features.map((f, i) => (
              <div key={f.t} className="contents">
                <Feature icon={f.i} title={f.t} body={f.b} large={i === 0} />
                {i === Math.min(1, t.features.length - 1) && (
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d11] p-4 sm:col-span-2 lg:row-span-2">
                    <div className="aspect-[8/5] w-full">
                      <PairingArt label={t.pairingAlt} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section id="pricing" className="scroll-mt-16 border-t border-white/[0.06] py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <div className="mb-10">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e9b149]">
              {t.pricingEyebrow}
            </div>
            <h2 className="font-display break-words text-3xl font-black sm:text-4xl md:text-5xl">{t.pricingTitle}</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3 md:items-stretch">
            <PricingCard
              className={armenia ? "md:order-1" : "md:order-3"}
              highlighted
              featured={armenia}
              title={t.annualTitle}
              price={ru ? RU_PRICES.annual.price : prices.annual}
              period={t.annualTotal}
              subprice={ru ? RU_PRICES.annual.sub : t.annualSub}
              tag={t.annualTag}
              features={t.annualFeatures}
              cta={t.annualCta}
              badgeLabel={t.annualBadge}
              to="/pricing"
            />
            {georgia ? (
              <PricingCard
                className="md:order-2"
                title={semi.title}
                price={prices.semiannual}
                period={semi.total}
                subprice={semi.sub}
                tag={semi.tag}
                features={[...semi.features]}
                cta={semi.cta}
                to="/pricing"
              />
            ) : (
              <PricingCard
                className={armenia ? "md:order-2" : "md:order-1"}
                title={t.monthlyTitle}
                price={ru ? RU_PRICES.monthly.price : prices.monthly}
                period={t.monthlyPeriod}
                subprice={ru ? RU_PRICES.monthly.sub : undefined}
                tag={t.monthlyTag}
                features={t.monthlyFeatures}
                cta={t.monthlyCta}
                to="/pricing"
              />
            )}
            <PricingCard
              className={armenia ? "md:order-3" : georgia ? "md:order-1" : "md:order-2"}
              title={t.quarterlyTitle}
              price={ru ? RU_PRICES.quarterly.price : prices.quarterly}
              period={t.quarterlyTotal}
              subprice={ru ? RU_PRICES.quarterly.sub : t.quarterlySub}
              tag={t.quarterlyTag}
              features={t.quarterlyFeatures}
              cta={t.quarterlyCta}
              badgeLabel={t.saveBadge}
              to="/pricing"
            />
          </div>
          <p className="mt-6 text-sm text-white/60">{t.pricingFoot}</p>
        </div>
      </section>

      {/* CONTACT */}
      <section className="border-y border-white/[0.06] bg-[#0a0d11]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e9b149]">
              {t.contactEyebrow}
            </div>
            <h2 className="font-display break-words text-xl font-black sm:text-2xl">{t.contactTitle}</h2>
            <p className="mt-1 max-w-xl text-sm text-white/70">{t.contactBody}</p>
          </div>
          <a
            href="https://www.facebook.com/profile.php?id=61594077238294"
            target="_blank"
            rel="noopener noreferrer"
            className="font-display inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-bold text-white transition hover:border-[#3b82f6] hover:bg-[#3b82f6]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9b149]"
          >
            <span aria-hidden="true">💬</span>
            {t.contactCta}
          </a>
        </div>
      </section>

      <Footer text={t.footer} brand={brand} />
    </div>
  );
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9b149] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050708]";

function Nav({
  signedIn,
  t,
  lang,
  onLang,
  armenia,
}: {
  signedIn: boolean;
  t: Translation;
  lang: Lang;
  onLang: (l: Lang) => void;
  armenia: boolean;
}) {
  const solid = `inline-flex min-h-11 items-center rounded-lg bg-white px-3 text-sm font-semibold text-black hover:bg-white/90 sm:px-4 ${FOCUS}`;
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#050708]/90 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-[1440px] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 sm:px-8">
        <Link to="/" className={`font-display flex shrink-0 items-center gap-2 rounded-md text-base font-black tracking-tight ${FOCUS}`}>
          <TMapMark />
          <span className="hidden min-[400px]:inline">{armenia || lang === "ru" ? "TMap" : "TMap Georgia"}</span>
        </Link>
        <nav className="hidden items-center text-sm text-white/70 md:flex">
          <a href="#pricing" className={`rounded-md px-2 py-2 hover:text-white ${FOCUS}`}>
            {t.navPricing}
          </a>
        </nav>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          {!armenia && (
            <div className="flex items-center rounded-lg border border-white/10 p-0.5 text-[11px] font-bold">
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onLang(l)}
                  className={`min-h-9 min-w-8 rounded-md px-1.5 transition sm:px-2 ${FOCUS} ${
                    lang === l ? "bg-white text-black" : "text-white/70 hover:text-white"
                  }`}
                  aria-pressed={lang === l}
                >
                  {LANG_LABEL[l]}
                </button>
              ))}
            </div>
          )}
          {signedIn ? (
            <>
              {armenia ? (
                <a href="https://tmap.ge/hub?from=am" className={solid}>
                  {t.navOpenApp}
                </a>
              ) : (
                <Link to="/hub" className={solid}>
                  {t.navOpenApp}
                </Link>
              )}
              <AccountMenu signOutLabel={SIGN_OUT_LABEL[lang]} />
            </>
          ) : (
            <>
              <Link to="/auth" className={`hidden min-h-11 items-center rounded-md px-2 text-sm text-white/75 hover:text-white sm:inline-flex ${FOCUS}`}>
                {t.navSignIn}
              </Link>
              <Link to="/pricing" className={solid}>
                {t.navGetStarted}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-white/[0.06] px-5 py-4 last:border-b-0 sm:block sm:border-b-0 sm:px-8">
      <dt className="sr-only">{l}</dt>
      <dd className="font-display text-2xl font-black tabular-nums text-white">{n}</dd>
      <dd className="mt-0.5 text-xs uppercase tracking-wider text-white/60">{l}</dd>
    </div>
  );
}

function Feature({ icon, title, body, large }: { icon: string; title: string; body: string; large?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        large
          ? "border-[#3b82f6]/30 bg-[#3b82f6]/[0.06] sm:col-span-2 lg:row-span-2 lg:p-8"
          : "border-white/10 bg-[#0a0d11]"
      }`}
    >
      <div className={`mb-4 ${large ? "text-3xl" : "text-xl"}`} aria-hidden="true">{icon}</div>
      <div className={`font-display break-words font-bold ${large ? "text-2xl lg:text-3xl" : "text-lg"}`}>{title}</div>
      <div className={`mt-2 text-white/70 ${large ? "text-base" : "text-sm"}`}>{body}</div>
    </div>
  );
}

function ComparePane({
  tone,
  eyebrow,
  title,
  bullets,
}: {
  tone: "good" | "bad";
  eyebrow: string;
  title: string;
  bullets: readonly string[];
}) {
  const isBad = tone === "bad";
  return (
    <div
      className={`p-7 sm:p-10 ${
        isBad
          ? "bg-[#0a0c0e] grayscale"
          : "border-t border-white/10 bg-[#3b82f6]/[0.08] md:border-l md:border-t-0 md:border-l-[#3b82f6]/40"
      }`}
    >
      <div className={`text-[11px] font-bold uppercase tracking-[0.18em] ${isBad ? "text-white/55" : "text-[#7fb0ff]"}`}>
        {eyebrow}
      </div>
      <div className={`font-display mt-2 break-words text-2xl font-black ${isBad ? "text-white/70" : "text-white"}`}>{title}</div>
      <ul className={`mt-6 space-y-3 text-sm ${isBad ? "text-white/60" : "text-white/85"}`}>
        {bullets.map((b) => (
          <li key={b} className="flex gap-3">
            <span className={`shrink-0 font-bold ${isBad ? "text-white/45" : "text-[#3b82f6]"}`} aria-hidden="true">
              {isBad ? "✕" : "✓"}
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PricingCard({
  title,
  price,
  period,
  subprice,
  tag,
  features,
  cta,
  to,
  highlighted,
  featured,
  badgeLabel,
  className,
}: {
  title: string;
  price: string;
  period: string;
  subprice?: string;
  tag: string;
  features: readonly string[];
  cta: string;
  to: string;
  highlighted?: boolean;
  featured?: boolean;
  badgeLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl border p-7 ${
        highlighted ? "border-[#3b82f6] bg-[#0c1626]" : "border-white/10 bg-[#0a0d11]"
      } ${featured ? "ring-2 ring-[#e9b149]/70" : ""} ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{title}</div>
        {highlighted && (
          <div className={`rounded-md bg-[#e9b149] px-2 py-0.5 font-black uppercase tracking-wider text-black ${featured ? "text-xs" : "text-[10px]"}`}>
            {badgeLabel ?? "Save 10%"}
          </div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-baseline gap-x-1.5">
        <span className={`font-display font-black tabular-nums ${highlighted ? "text-5xl lg:text-6xl" : "text-5xl"}`}>{price}</span>
        <span className="text-white/65">{period}</span>
      </div>
      {subprice && <div className="mt-1 text-sm font-semibold text-[#e9b149]">{subprice}</div>}
      <div className="mt-1 text-xs text-white/60">{tag}</div>

      <ul className="mt-6 flex-1 space-y-2.5 border-t border-white/10 pt-5 text-sm text-white/80">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="shrink-0 text-[#3b82f6]" aria-hidden="true">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        to={to}
        className={`font-display mt-7 flex min-h-12 items-center justify-center rounded-xl px-4 text-center text-sm font-bold transition ${FOCUS} ${
          highlighted ? "bg-[#3b82f6] text-white hover:brightness-110" : "border border-white/15 text-white hover:bg-white/5"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function Footer({ text, brand }: { text: string; brand: string }) {
  const link = `inline-flex min-h-11 items-center rounded-md text-white/75 transition hover:text-white ${FOCUS}`;
  return (
    <footer className="px-5 py-10 text-center text-xs text-white/60 sm:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-x-6">
        <Link to="/terms" className={link}>
          Terms &amp; Conditions
        </Link>
        <Link to="/refund" className={link}>
          Refund Policy
        </Link>
        <Link to="/privacy" className={link}>
          Privacy Notice
        </Link>
      </div>
      <p>© {new Date().getFullYear()} {brand} · {text}</p>
      <p className="mx-auto mt-3 max-w-2xl text-sm text-white/70">
        {brand} is an independent product and is not affiliated with or endorsed by Tesla, Inc.
      </p>
    </footer>
  );
}
