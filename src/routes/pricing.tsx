import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Plan = "monthly" | "quarterly";
const PLAN_KEY = "tsl.pending-plan";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Pricing — MyTesla.ge" },
      {
        name: "description",
        content:
          "8 ₾/month or 21.60 ₾ every 3 months (save 10%). Live navigation for imported Teslas in Georgia.",
      },
    ],
  }),
});

function PricingPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Plan>("quarterly");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
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
            MyTesla<span className="text-white/40">.ge</span>
          </Link>
          <Link to="/" className="text-sm text-white/60 hover:text-white">
            ← Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-6 pb-24 pt-16">
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase tracking-widest text-[#e9b149]">
            Membership
          </div>
          <h1 className="font-display mt-2 text-4xl font-black md:text-5xl">Pick your plan</h1>
          <p className="mt-3 text-white/60">
            One account = one device. Cancel anytime, no lock-in.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <PlanCard
            plan="monthly"
            selected={selected === "monthly"}
            onSelect={() => setSelected("monthly")}
            title="Monthly"
            price="8 ₾"
            period="per month"
            subtitle="Billed every month"
            perMonth="8 ₾/mo"
          />
          <PlanCard
            plan="quarterly"
            selected={selected === "quarterly"}
            onSelect={() => setSelected("quarterly")}
            title="3 months"
            price="21.60 ₾"
            period="every 3 months"
            subtitle="10% off — best value"
            perMonth="7.20 ₾/mo"
            highlighted
          />
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/70">
          <div className="mb-2 font-semibold text-white">What you get</div>
          <ul className="grid gap-1.5 md:grid-cols-2">
            {[
              "Live in-car navigation optimized for Tesla",
              "Phone GPS pairing (real 1 m accuracy)",
              "Turn-by-turn HUD & voice guidance",
              "Live traffic + auto-rerouting",
              "Georgian streets, addresses, POIs",
              "Supercharger stop planning",
            ].map((f) => (
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
          {signedIn === false
            ? "Create account & continue →"
            : "Continue to checkout →"}
        </button>
        <p className="mt-3 text-center text-xs text-white/40">
          Secure checkout. No hidden fees. Cancel anytime from your account.
        </p>
      </main>
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
      {highlighted && (
        <div className="absolute -top-3 left-6 rounded-full bg-[#e9b149] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-black">
          Save 10%
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
