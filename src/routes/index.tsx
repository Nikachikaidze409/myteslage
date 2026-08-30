import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import heroImg from "@/assets/hero-dashboard.jpg";
import pairingImg from "@/assets/feature-pairing.jpg";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Tesla Map Georgia - ნავიგაცია იმპორტირებული Tesla-სთვის საქართველოში" },
      {
        name: "description",
        content:
          "დაივიწყე Tesla Premium Connectivity. ცოცხალი ნავიგაცია პირდაპირ Tesla-ს ეკრანზე - მხოლოდ 8 ₾ თვეში.",
      },
      { property: "og:title", content: "Tesla Map Georgia - ნავიგაცია, რომელიც Tesla-ს უნდა ჰქონდეს" },
      {
        property: "og:description",
        content:
          "ნამდვილი GPS. ნამდვილი მარშრუტები. ნამდვილი ქართული ქუჩები. 8 ₾/თვე.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Lang = "ka" | "en";
const LANG_KEY = "mytesla.lang";

const T = {
  ka: {
    navPricing: "ფასები",
    navSignIn: "შესვლა",
    navGetStarted: "დაწყება",
    navOpenApp: "აპლიკაცია →",
    heroBadge: "იმპორტირებული Tesla-სთვის · საქართველო",
    heroTitle1: "ნავიგაცია,",
    heroTitle2: "რომელიც შენს Tesla-ს",
    heroTitle3: "უნდა ჰქონდეს.",
    heroBody: (
      <>
        Tesla-ს ჩაშენებული რუკები არასწორად მუშაობს იმპორტირებულ მანქანებზე
        საქართველოში. Premium Connectivity ღირს{" "}
        <span className="text-white">$99 წელიწადში</span> და მაინც არ ხდის მას
        გამოსადეგს. ჩვენ ავაშენეთ ალტერნატივა - ცოცხალი რუკა პირდაპირ შენი Tesla-ს ეკრანზე.
      </>
    ),
    heroCta: "დაიწყე 8 ₾/თვე-დან",
    stat1: "±1 მ",
    stat1l: "ცოცხალი GPS ტელეფონით",
    stat2: "17″",
    stat2l: "ოპტიმიზირებული Tesla-სთვის",
    stat3: "0",
    stat3l: "დამატებითი აღჭურვილობა",
    heroImgAlt: "Tesla Model 3-ის ეკრანი ცოცხალი ნავიგაციით თბილისში",
    badEyebrow: "პრობლემა",
    badTitle: "Tesla Premium Connectivity - 300 ₾/წელი",
    badBullets: [
      "იმპორტირებულ მანქანებზე საქართველოში მაინც არ მარშრუტდება სწორად",
      "ყოველთვიური გადასახადი იმ ფუნქციებზე, რომლებზეც უკვე გადაიხადე",
      "მიბმულია Tesla-ს ძველ რუკის მონაცემებზე მხარდაუჭერელ ქვეყნებში",
    ],
    goodEyebrow: "გამოსავალი",
    goodTitle: "Tesla Map Georgia - 8 ₾/თვე",
    goodBullets: [
      "Google-ის ხარისხის რუკები, რომლებმაც იციან ქართული ქუჩები",
      "რეალურ დროში GPS შენი ტელეფონიდან → მანქანის 17″ ეკრანზე",
      "ცოცხალი ტრეფიკი, ალტერნატიული მარშრუტები, ავტო-გადამისამართება, HUD რეჟიმი",
    ],
    featuresTitle: "აშენებულია მანქანისთვის, მუშაობს შენი ტელეფონით.",
    featuresBody:
      "დააჟუფლე ერთხელ QR-კოდით. შენი ტელეფონი GPS-ს პირდაპირ Tesla-ს ბრაუზერში გადასცემს - მანქანა კი ცოცხალ რუკას აჩვენებს. აპლიკაცია, კაბელი და CarPlay-ის ჰაკები აღარ გჭირდება.",
    features: [
      { i: "📍", t: "რეალური GPS, ცოცხალი", b: "ტელეფონის ჩიპი ბევრად უფრო ზუსტია ვიდრე ბრაუზერი. მას რეალურ დროში მანქანაზე გადავცემთ." },
      { i: "🧭", t: "მოქცევა-მოქცევით HUD", b: "სრულ ეკრანზე ნავიგაცია დიდი ETA-თი, დისტანციითა და სიჩქარით - გამარჯვის ერთი მზერით წასაკითხად." },
      { i: "⚡", t: "ტრეფიკი და გადამისამართება", b: "ცოცხალი ტრეფიკის ფენა, ალტერნატიული მარშრუტები და ავტომატური გადამისამართება როცა კურსიდან გადაუხვევ." },
      { i: "🔋", t: "Supercharger-ის დაგეგმვა", b: "შეიყვანე ბატარეის %, ჩვენ დაგიგეგმავთ დამუხტვის გაჩერებებს გზაზე." },
      { i: "🇬🇪", t: "ადგილობრივი ქუჩები", b: "ქართული მისამართები, თბილისის უკუ-ქუჩები, უასფალტო გზების გაფრთხილება - მორგებული ქვეყანაზე." },
      { i: "🔒", t: "მხოლოდ წევრებისთვის", b: "ერთი ანგარიში, ერთი მოწყობილობა. სხვა მანქანაზე გაზიარება ვერ მოხერხდება." },
    ],
    pairingAlt: "ტელეფონის დაწყვილება Tesla-ს ეკრანთან QR-კოდით",
    pricingEyebrow: "ფასები",
    pricingTitle: "ერთი ფასი. Tesla-ს ფასის ნახევარიც არაა.",
    monthlyTitle: "ყოველთვიური",
    monthlyPeriod: "/თვე",
    monthlyTag: "შეწყვიტე ნებისმიერ დროს",
    monthlyFeatures: [
      "ცოცხალი რუკა მანქანაში",
      "ტელეფონის GPS დაწყვილება",
      "მოქცევა-მოქცევით HUD",
      "ტრეფიკი და გადამისამართება",
    ],
    monthlyCta: "ყოველთვიური გეგმა",
    quarterlyTitle: "3 თვე წინასწარ",
    quarterlyTotal: " სულ",
    quarterlySub: "7.20 ₾/თვე · დაზოგე 10%",
    quarterlyTag: "საუკეთესო ღირებულება",
    quarterlyFeatures: [
      "ყველაფერი Monthly-დან",
      "10% ფასდაკლება ყოველთვიურთან შედარებით",
      "ერთი გადახდა, სამი თვე",
      "პრიორიტეტული მხარდაჭერა",
    ],
    quarterlyCta: "დაზოგე 10% →",
    saveBadge: "დაზოგე 10%",
    pricingFoot:
      "შედარება: Tesla Premium Connectivity ≈ 300 ₾/წელი და მაინც არ მარშრუტდება საქართველოში.",
    footer: "Tesla-ს მფლობელებისთვის საქართველოში",
  },
  en: {
    navPricing: "Pricing",
    navSignIn: "Sign in",
    navGetStarted: "Get started",
    navOpenApp: "Open app →",
    heroBadge: "For imported Teslas · Georgia",
    heroTitle1: "The navigation",
    heroTitle2: "your Tesla",
    heroTitle3: "should have.",
    heroBody: (
      <>
        Tesla's built-in maps don't work correctly on imported cars in Georgia. Premium
        Connectivity costs <span className="text-white">$99/year</span> and still won't fix it.
        We built the alternative - a real, live map that runs right on your Tesla's screen.
      </>
    ),
    heroCta: "Start from 8 ₾/mo",
    stat1: "±1 m",
    stat1l: "Live GPS via phone",
    stat2: "17″",
    stat2l: "Optimized for Tesla",
    stat3: "0",
    stat3l: "Extra hardware",
    heroImgAlt: "Tesla Model 3 dashboard showing live navigation in Tbilisi",
    badEyebrow: "The problem",
    badTitle: "Tesla Premium Connectivity - 300 ₾/year",
    badBullets: [
      "Still doesn't route correctly on imported cars in Georgia",
      "Ties you into a subscription for features you already paid for",
      "Locked to Tesla's aging map data outside supported countries",
    ],
    goodEyebrow: "The solution",
    goodTitle: "Tesla Map Georgia - 8 ₾/month",
    goodBullets: [
      "Google-quality maps that actually know Georgian streets",
      "Real-time GPS from your phone → your car's 17″ screen",
      "Live traffic, alternates, auto-rerouting, HUD mode",
    ],
    featuresTitle: "Built for the car, powered by your phone.",
    featuresBody:
      "Pair once with a QR code. Your phone streams high-accuracy GPS to the Tesla browser; the Tesla shows the live map. That's it - no app store, no cable, no CarPlay hack.",
    features: [
      { i: "📍", t: "Real GPS, live", b: "Your phone's chip is far more accurate than a browser. We stream it to the car in real time." },
      { i: "🧭", t: "Turn-by-turn HUD", b: "Full-screen navigation with giant ETA, distance, and speed - designed to read at a glance." },
      { i: "⚡", t: "Traffic & rerouting", b: "Live traffic layer, alternate routes, and automatic rerouting when you drift off course." },
      { i: "🔋", t: "Supercharger planning", b: "Enter your battery %, and we'll plan charging stops along the way." },
      { i: "🇬🇪", t: "Local streets", b: "Georgian addresses, Tbilisi backroads, unpaved-road warnings - tuned for the country." },
      { i: "🔒", t: "Membership only", b: "One account, one device. Your subscription can't be shared to another car." },
    ],
    pairingAlt: "Phone pairing with Tesla screen via QR code",
    pricingEyebrow: "Pricing",
    pricingTitle: "One price. A fraction of what Tesla charges.",
    monthlyTitle: "Monthly",
    monthlyPeriod: "/month",
    monthlyTag: "Cancel anytime",
    monthlyFeatures: ["Live in-car map", "Phone GPS pairing", "Turn-by-turn HUD", "Traffic & rerouting"],
    monthlyCta: "Start monthly",
    quarterlyTitle: "3 months upfront",
    quarterlyTotal: " total",
    quarterlySub: "7.20 ₾/mo · save 10%",
    quarterlyTag: "Best value",
    quarterlyFeatures: [
      "Everything in Monthly",
      "10% off vs paying month-to-month",
      "One payment, three months",
      "Priority support",
    ],
    quarterlyCta: "Save 10% →",
    saveBadge: "Save 10%",
    pricingFoot:
      "Compare: Tesla Premium Connectivity ≈ 300 ₾/year and still doesn't route Georgia.",
    footer: "Made for Tesla owners in Georgia",
  },
} as const;

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  const [lang, setLang] = useState<Lang>("ka");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY) as Lang | null;
      if (saved === "ka" || saved === "en") setLang(saved);
    } catch {}
  }, []);

  const setLangPersist = (l: Lang) => {
    setLang(l);
    try {
      window.localStorage.setItem(LANG_KEY, l);
    } catch {}
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const t = T[lang];

  return (
    <div className="min-h-screen bg-[#050708] text-white" lang={lang}>
      <Nav signedIn={signedIn} t={t} lang={lang} onLang={setLangPersist} />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(59,130,246,0.18),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_40%_at_100%_100%,rgba(233,177,73,0.10),transparent_70%)]" />
        <div className="mx-auto grid max-w-[1200px] gap-10 px-6 pb-20 pt-24 lg:grid-cols-[1.05fr_1fr] lg:pt-32">
          <div className="animate-fade-in">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/70">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e9b149]" />
              {t.heroBadge}
            </div>
            <h1 className="font-display text-5xl font-black leading-[1.02] tracking-tight md:text-6xl lg:text-7xl">
              {t.heroTitle1}
              <br />
              {t.heroTitle2}{" "}
              <span className="bg-gradient-to-r from-[#3b82f6] via-[#60a5fa] to-[#e9b149] bg-clip-text text-transparent">
                {t.heroTitle3}
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">{t.heroBody}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/pricing"
                className="font-display group inline-flex h-14 items-center justify-center rounded-2xl bg-[#3b82f6] px-7 text-base font-bold text-white shadow-[0_10px_40px_-10px_rgba(59,130,246,0.7)] transition hover:brightness-110"
              >
                {t.heroCta}
                <span className="ml-2 transition group-hover:translate-x-1">→</span>
              </Link>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6 text-sm">
              <Stat n={t.stat1} l={t.stat1l} />
              <Stat n={t.stat2} l={t.stat2l} />
              <Stat n={t.stat3} l={t.stat3l} />
            </dl>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-[#3b82f6]/30 to-[#e9b149]/20 blur-2xl" />
            <div className="animate-scale-in relative overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl">
              <img
                src={heroImg}
                alt={t.heroImgAlt}
                width={1600}
                height={1000}
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* THE PROBLEM / SOLUTION */}
      <section className="border-y border-white/5 bg-white/[0.02] py-20">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-6 md:grid-cols-2">
          <Card
            tone="bad"
            eyebrow={t.badEyebrow}
            title={t.badTitle}
            bullets={t.badBullets}
          />
          <Card
            tone="good"
            eyebrow={t.goodEyebrow}
            title={t.goodTitle}
            bullets={t.goodBullets}
          />
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24">
        <div className="mx-auto max-w-[1200px] px-6">
          <h2 className="font-display max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            {t.featuresTitle}
          </h2>
          <p className="mt-4 max-w-2xl text-white/60">{t.featuresBody}</p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {t.features.map((f) => (
              <Feature key={f.t} icon={f.i} title={f.t} body={f.b} />
            ))}
          </div>

          <div className="mt-16 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
            <img
              src={pairingImg}
              alt={t.pairingAlt}
              loading="lazy"
              width={1200}
              height={912}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section id="pricing" className="border-t border-white/5 bg-gradient-to-b from-transparent to-[#3b82f6]/[0.06] py-24">
        <div className="mx-auto max-w-[1200px] px-6">
          <div className="mb-12 text-center">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#e9b149]">
              {t.pricingEyebrow}
            </div>
            <h2 className="font-display text-4xl font-black md:text-5xl">
              {t.pricingTitle}
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <PricingCard
              title={t.monthlyTitle}
              price="8 ₾"
              period={t.monthlyPeriod}
              tag={t.monthlyTag}
              features={t.monthlyFeatures}
              cta={t.monthlyCta}
              to="/pricing"
            />
            <PricingCard
              highlighted
              title={t.quarterlyTitle}
              price="21.60 ₾"
              period={t.quarterlyTotal}
              subprice={t.quarterlySub}
              tag={t.quarterlyTag}
              features={t.quarterlyFeatures}
              cta={t.quarterlyCta}
              badgeLabel={t.saveBadge}
              to="/pricing"
            />
          </div>
          <p className="mt-6 text-center text-sm text-white/50">{t.pricingFoot}</p>
        </div>
      </section>

      <Footer text={t.footer} />
    </div>
  );
}

function Nav({
  signedIn,
  t,
  lang,
  onLang,
}: {
  signedIn: boolean;
  t: (typeof T)[Lang];
  lang: Lang;
  onLang: (l: Lang) => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#050708]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Link to="/" className="font-display flex items-center gap-2 text-lg font-black tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#e9b149] text-black">
            ⚡
          </span>
          Tesla Map Georgia
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
          <a href="#pricing" className="hover:text-white">{t.navPricing}</a>
        </nav>
        <div className="flex items-center gap-2">
          <div className="mr-1 flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-0.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => onLang("ka")}
              className={`rounded-md px-2 py-1 transition ${lang === "ka" ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
              aria-pressed={lang === "ka"}
            >
              ქარ
            </button>
            <button
              type="button"
              onClick={() => onLang("en")}
              className={`rounded-md px-2 py-1 transition ${lang === "en" ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
              aria-pressed={lang === "en"}
            >
              EN
            </button>
          </div>
          {signedIn ? (
            <Link
              to="/map"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              {t.navOpenApp}
            </Link>
          ) : (
            <>
              <Link to="/auth" className="hidden text-sm text-white/70 hover:text-white sm:inline">
                {t.navSignIn}
              </Link>
              <Link
                to="/pricing"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
              >
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
    <div>
      <div className="font-display text-2xl font-black text-white">{n}</div>
      <div className="mt-1 text-xs text-white/50">{l}</div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:border-white/20 hover:bg-white/[0.04]">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-xl">
        {icon}
      </div>
      <div className="font-display text-lg font-bold">{title}</div>
      <div className="mt-1.5 text-sm text-white/60">{body}</div>
    </div>
  );
}

function Card({
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
      className={`rounded-3xl border p-8 ${
        isBad
          ? "border-white/10 bg-white/[0.02]"
          : "border-[#3b82f6]/40 bg-gradient-to-br from-[#3b82f6]/10 to-[#e9b149]/5"
      }`}
    >
      <div
        className={`text-[11px] font-bold uppercase tracking-widest ${
          isBad ? "text-red-400/80" : "text-[#e9b149]"
        }`}
      >
        {eyebrow}
      </div>
      <div className="font-display mt-2 text-2xl font-black">{title}</div>
      <ul className="mt-5 space-y-3 text-sm text-white/70">
        {bullets.map((b) => (
          <li key={b} className="flex gap-3">
            <span className={isBad ? "text-red-400" : "text-emerald-400"}>{isBad ? "✕" : "✓"}</span>
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
  badgeLabel,
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
  badgeLabel?: string;
}) {
  return (
    <div
      className={`relative rounded-3xl border p-8 ${
        highlighted
          ? "border-[#3b82f6]/60 bg-gradient-to-br from-[#3b82f6]/15 via-transparent to-[#e9b149]/10 shadow-[0_20px_80px_-20px_rgba(59,130,246,0.5)]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      {highlighted && (
        <div className="absolute -top-3 left-8 rounded-full bg-[#e9b149] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-black">
          {badgeLabel ?? "Save 10%"}
        </div>
      )}
      <div className="text-[11px] font-bold uppercase tracking-widest text-white/60">{title}</div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-5xl font-black">{price}</span>
        <span className="text-white/60">{period}</span>
      </div>
      {subprice && <div className="mt-1 text-sm text-[#e9b149]">{subprice}</div>}
      <div className="mt-1 text-xs text-white/50">{tag}</div>

      <ul className="mt-6 space-y-2.5 text-sm text-white/70">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="text-emerald-400">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <Link
        to={to}
        className={`font-display mt-7 flex h-12 items-center justify-center rounded-xl text-sm font-bold transition ${
          highlighted
            ? "bg-[#3b82f6] text-white hover:brightness-110"
            : "bg-white text-black hover:bg-white/90"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function Footer({ text }: { text: string }) {
  return (
    <footer className="border-t border-white/5 py-10 text-center text-xs text-white/40">
      <div className="mb-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        <Link to="/terms" className="text-white/60 transition hover:text-white">
          Terms & Conditions
        </Link>
        <Link to="/refund" className="text-white/60 transition hover:text-white">
          Refund Policy
        </Link>
        <Link to="/privacy" className="text-white/60 transition hover:text-white">
          Privacy Notice
        </Link>
      </div>
      © {new Date().getFullYear()} Tesla Map Georgia · {text}
    </footer>
  );
}
