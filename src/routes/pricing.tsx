import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AccountBar } from "@/components/AccountBar";
import { LegalFooter } from "@/components/LegalFooter";
import { useMarket } from "@/lib/market-context";
import { AM_CONVERSION_NOTE, MARKET_BOG_LABELS } from "@/lib/market";

type Plan = "monthly" | "quarterly" | "annual";
const PLAN_KEY = "tsl.pending-plan";

/** Page copy per market: Georgian site stays English, tmap.am is Armenian. */
const COPY = {
  ge: {
    eyebrow: "Membership",
    title: "Pick your plan",
    subtitle: "One account = one device. Cancel anytime, no lock-in.",
    monthlyTitle: "Monthly",
    monthlyPeriod: "per month",
    monthlySub: "Billed every month",
    monthlyPerMonth: "8 ₾/mo",
    quarterlyTitle: "3 months",
    quarterlyPeriod: "every 3 months",
    quarterlySub: "10% off",
    quarterlyPerMonth: "7.20 ₾/mo",
    annualTitle: "1 year",
    annualPeriod: "per year",
    annualSub: "Best value - one payment a year",
    annualPerMonth: "7.08 ₾/mo",
    annualBadge: "Save 11%",
    included: "What you get",
    features: [
      "Live in-car navigation optimized for Tesla",
      "Phone GPS pairing (real 1 m accuracy)",
      "Turn-by-turn HUD & voice guidance",
      "Live traffic + auto-rerouting",
      "Georgian streets, addresses, POIs",
      "Supercharger stop planning",
    ],
    ctaSignup: "Create account & continue →",
    ctaCheckout: "Continue to checkout →",
    note: "Secure checkout. No hidden fees. Cancel anytime from your account.",
    back: "← Back",
  },
  am: {
    eyebrow: "Բաժանորդագրություն",
    title: "Ընտրեք ձեր փաթեթը",
    subtitle: "Մեկ հաշիվ = մեկ սարք։ Չեղարկեք ցանկացած պահի։",
    monthlyTitle: "Ամսական",
    monthlyPeriod: "ամսական",
    monthlySub: "Գանձվում է ամեն ամիս",
    monthlyPerMonth: "2,099 AMD/ամիս",
    quarterlyTitle: "3 ամիս",
    quarterlyPeriod: "3 ամիսը մեկ",
    quarterlySub: "11% զեղչ",
    quarterlyPerMonth: "1,867 AMD/ամիս",
    annualTitle: "1 տարի · 2 ամիս ՆՎԵՐ",
    annualPeriod: "տարեկան",
    annualSub: "Վճարում եք 10 ամսվա համար, օգտվում՝ 12 ամիս",
    annualPerMonth: "1,735 AMD/ամիս",
    annualBadge: "2 ամիս ՆՎԵՐ 🎁",
    included: "Ի՞նչ եք ստանում",
    features: [
      "Կենդանի նավիգացիա մեքենայի էկրանին",
      "Հեռախոսի GPS զուգակցում (իրական ճշգրտություն)",
      "Քայլ առ քայլ HUD և ձայնային ուղեկցում",
      "Կենդանի երթևեկություն և ավտո-վերաերթուղում",
      "Հայկական և վրացական հասցեներ ու փողոցներ",
      "Supercharger կանգառների պլանավորում",
    ],
    ctaSignup: "Ստեղծել հաշիվ և շարունակել →",
    ctaCheckout: "Անցնել վճարման →",
    note: AM_CONVERSION_NOTE,
    back: "← Հետ",
  },
} as const;

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing - TMap Georgia" },
      {
        name: "description",
        content:
          "8 ₾/month, 21.60 ₾ every 3 months, or 85 ₾ a year. Live navigation for imported Teslas in Georgia.",
      },
      { property: "og:title", content: "Pricing - TMap Georgia" },
      { property: "og:description", content: "Choose a TMap Georgia navigation membership: 8 ₾ monthly, 21.60 ₾ quarterly, or 85 ₾ annually." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://tmap.ge/pricing" }],
  }),
});

function PricingPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Plan>("annual");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [noMembership, setNoMembership] = useState(false);
  const market = useMarket();
  const am = market === "am";
  const c = COPY[market];
  const prices = MARKET_BOG_LABELS[market];

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    try {
      setNoMembership(!!window.sessionStorage.getItem("tsl.no-membership"));
    } catch {
      /* ignore */
    }
  }, []);

  const proceed = () => {
    try {
      window.localStorage.setItem(PLAN_KEY, selected);
    } catch {
      /* ignore */
    }
    if (signedIn) navigate({ to: "/checkout" });
    else navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-[#050708] text-white">
      <header className="border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
          <Link to="/" className="font-display flex items-center gap-2 text-lg font-black">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#e9b149] text-black">
              ⚡
            </span>
            {am ? "TMap" : "TMap Georgia"}
          </Link>
          <Link to="/" className="text-sm text-white/60 hover:text-white">
            {c.back}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-6 pb-24 pt-16">
        <AccountBar
          note={
            noMembership
              ? "This account has no active membership. If you paid with a different email, sign out and sign in with that email."
              : null
          }
        />
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#e9b149]">
            {c.eyebrow}
          </div>
          <h1 className="font-display mt-2 text-4xl font-black md:text-5xl">{c.title}</h1>
          <p className="mt-3 text-white/60">{c.subtitle}</p>
        </div>

        <div className="mt-12 grid items-start gap-5 md:grid-cols-3">
          <PlanCard
            plan="annual"
            className={am ? "md:order-1" : "md:order-3"}
            featured={am}
            selected={selected === "annual"}
            onSelect={() => setSelected("annual")}
            title={c.annualTitle}
            price={prices.annual}
            period={c.annualPeriod}
            subtitle={c.annualSub}
            perMonth={c.annualPerMonth}
            badge={c.annualBadge}
            highlighted
          />
          <PlanCard
            plan="monthly"
            className={am ? "md:order-2" : "md:order-1"}
            selected={selected === "monthly"}
            onSelect={() => setSelected("monthly")}
            title={c.monthlyTitle}
            price={prices.monthly}
            period={c.monthlyPeriod}
            subtitle={c.monthlySub}
            perMonth={c.monthlyPerMonth}
          />
          <PlanCard
            plan="quarterly"
            className={am ? "md:order-3" : "md:order-2"}
            selected={selected === "quarterly"}
            onSelect={() => setSelected("quarterly")}
            title={c.quarterlyTitle}
            price={prices.quarterly}
            period={c.quarterlyPeriod}
            subtitle={c.quarterlySub}
            perMonth={c.quarterlyPerMonth}
          />
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/70">
          <div className="mb-2 font-semibold text-white">{c.included}</div>
          <ul className="grid gap-1.5 md:grid-cols-2">
            {c.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-emerald-400">✓</span> {f}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={proceed}
          className="font-display mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-[#3b82f6] text-base font-bold text-white shadow-[0_10px_40px_-10px_rgba(59,130,246,0.7)] transition hover:brightness-110"
        >
          {signedIn === false ? c.ctaSignup : c.ctaCheckout}
        </button>
        <p className="mt-3 text-center text-xs text-white/40">{c.note}</p>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-white/40">
          <Link to="/terms" className="text-white/60 transition hover:text-white">
            Terms & Conditions
          </Link>
          <Link to="/refund" className="text-white/60 transition hover:text-white">
            Refund Policy
          </Link>
          <Link to="/privacy" className="text-white/60 transition hover:text-white">
            Privacy Notice
          </Link>
        </p>
      </main>
      <LegalFooter />
    </div>
  );
}

function PlanCard({
  selected,
  onSelect,
  title,
  price,
  period,
  subtitle,
  perMonth,
  badge,
  highlighted,
  featured,
  className,
}: {
  plan: Plan;
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: string;
  period: string;
  subtitle: string;
  perMonth: string;
  badge?: string;
  highlighted?: boolean;
  featured?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative rounded-3xl border p-7 text-left transition ${
        selected
          ? "border-[#3b82f6] bg-gradient-to-br from-[#3b82f6]/15 to-[#e9b149]/5 shadow-[0_20px_80px_-20px_rgba(59,130,246,0.5)]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25"
      } ${
        featured
          ? "ring-2 ring-[#e9b149]/70 md:-my-3 md:scale-[1.04] md:py-10 md:shadow-[0_30px_100px_-20px_rgba(233,177,73,0.45)]"
          : ""
      } ${className ?? ""}`}
    >
      {(badge ?? (highlighted ? "Save 10%" : null)) && (
        <div className="absolute -top-3 left-6 rounded-full bg-[#e9b149] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-black">
          {badge ?? "Save 10%"}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-white/60">
            {title}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`font-display font-black ${featured ? "text-4xl md:text-5xl" : "text-4xl"}`}>
              {price}
            </span>
            <span className="text-sm text-white/50">{period}</span>
          </div>
          <div className="mt-1 text-sm text-[#e9b149]">{perMonth}</div>
          <div className="mt-1 text-xs text-white/50">{subtitle}</div>
        </div>
        <div
          aria-hidden
          className={`grid h-6 w-6 place-items-center rounded-full border-2 ${
            selected ? "border-[#3b82f6] bg-[#3b82f6]" : "border-white/30"
          }`}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-white" />}
        </div>
      </div>
    </button>
  );
}
