import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AccountBar } from "@/components/AccountBar";
import { LegalFooter } from "@/components/LegalFooter";
import { UI, useLang, LanguageSwitcher } from "@/lib/i18n";

type Plan = "monthly" | "quarterly" | "annual";
const PLAN_KEY = "tsl.pending-plan";

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
  const [lang, setLang] = useLang();
  const t = UI[lang];

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
            TMap Georgia
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher lang={lang} onLang={setLang} />
            <Link to="/" className="text-sm text-white/60 hover:text-white">
              {t.back}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-6 pb-24 pt-16">
        <AccountBar
          note={
            noMembership
              ? t.noMembership
              : null
          }
        />
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#e9b149]">
            {t.membership}
          </div>
          <h1 className="font-display mt-2 text-4xl font-black md:text-5xl">{t.pickPlan}</h1>
          <p className="mt-3 text-white/60">{t.pickPlanSub}</p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <PlanCard
            plan="monthly"
            selected={selected === "monthly"}
            onSelect={() => setSelected("monthly")}
            title={t.monthly}
            price="8 ₾"
            period={t.perMonth}
            subtitle={t.billedMonthly}
            perMonth="8 ₾/mo"
          />
          <PlanCard
            plan="quarterly"
            selected={selected === "quarterly"}
            onSelect={() => setSelected("quarterly")}
            title={t.threeMonths}
            price="21.60 ₾"
            period={t.everyThree}
            subtitle={t.off10}
            perMonth="7.20 ₾/mo"
          />
          <PlanCard
            plan="annual"
            selected={selected === "annual"}
            onSelect={() => setSelected("annual")}
            title={t.oneYear}
            price="85 ₾"
            period={t.perYear}
            subtitle={t.bestValue}
            perMonth="7.08 ₾/mo"
            badge={t.save11}
            highlighted
          />
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/70">
          <div className="mb-2 font-semibold text-white">{t.whatYouGet}</div>
          <ul className="grid gap-1.5 md:grid-cols-2">
            {t.perks.map((f) => (
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
          {signedIn === false ? t.createAndContinue : t.continueCheckout}
        </button>
        <p className="mt-3 text-center text-xs text-white/40">
          {t.checkoutNote}
        </p>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-white/40">
          <Link to="/terms" className="text-white/60 transition hover:text-white">
            {t.terms}
          </Link>
          <Link to="/refund" className="text-white/60 transition hover:text-white">
            {t.refund}
          </Link>
          <Link to="/privacy" className="text-white/60 transition hover:text-white">
            {t.privacy}
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
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative rounded-3xl border p-7 text-left transition ${
        selected
          ? "border-[#3b82f6] bg-gradient-to-br from-[#3b82f6]/15 to-[#e9b149]/5 shadow-[0_20px_80px_-20px_rgba(59,130,246,0.5)]"
          : "border-white/10 bg-white/[0.02] hover:border-white/25"
      }`}
    >
      {(badge ?? (highlighted ? "-10%" : null)) && (
        <div className="absolute -top-3 left-6 rounded-full bg-[#e9b149] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-black">
          {badge ?? "-10%"}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-white/60">
            {title}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-4xl font-black">{price}</span>
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
