import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment, getPaddlePriceId, initializePaddle } from "@/lib/paddle";
import { AccountBar } from "@/components/AccountBar";

type Plan = "monthly" | "quarterly";

const PLAN_KEY = "tsl.pending-plan";
const PLANS: Record<Plan, {
  label: string;
  referencePrice: string;
  period: string;
  total: string;
  paddlePriceId: string;
  chargedPrice: string;
}> = {
  monthly: {
    label: "Monthly",
    referencePrice: "8 ₾",
    period: "per month",
    total: "8 ₾ reference price",
    paddlePriceId: "tesla_map_georgia_monthly",
    chargedPrice: "$2.99 USD",
  },
  quarterly: {
    label: "3 months · save 10%",
    referencePrice: "21.60 ₾",
    period: "every 3 months",
    total: "21.60 ₾ reference price",
    paddlePriceId: "tesla_map_georgia_quarterly",
    chargedPrice: "$7.99 USD",
  },
};

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({
    meta: [
      { title: "Secure checkout | Tesla Map Georgia" },
      { name: "description", content: "Start your Tesla Map Georgia membership with secure Paddle checkout." },
      { property: "og:title", content: "Secure checkout | Tesla Map Georgia" },
      { property: "og:description", content: "Start your Tesla Map Georgia membership with secure Paddle checkout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Checkout() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan>("quarterly");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(PLAN_KEY);
    if (stored === "monthly" || stored === "quarterly") setPlan(stored);

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(session.user.email ?? "");
      setUserId(session.user.id);
      setLoading(false);
    });
  }, [navigate]);

  const startCheckout = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      await initializePaddle();
      const paddlePriceId = await getPaddlePriceId(PLANS[plan].paddlePriceId);
      window.Paddle?.Checkout.open({
        items: [{ priceId: paddlePriceId, quantity: 1 }],
        customer: email ? { email } : undefined,
        customData: { userId },
        settings: {
          displayMode: "overlay",
          successUrl: `${window.location.origin}/checkout/success`,
          allowLogout: false,
          variant: "one-page",
        },
      });
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not open. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#050708] text-white/60">Loading…</div>;
  }

  const selectedPlan = PLANS[plan];

  return (
    <div className="min-h-screen bg-[#050708] text-white">
      <header className="border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-[900px] items-center justify-between px-6">
          <Link to="/" className="font-display flex items-center gap-2 text-lg font-black">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#e9b149] text-black">⚡</span>
            Tesla Map Georgia
          </Link>
          <Link to="/pricing" className="text-sm text-white/60 hover:text-white">← Change plan</Link>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-6 py-16">
        <AccountBar note="Paying for someone else's email? Sign out first and sign in with the email that should get the membership." />
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#e9b149]">Almost there</div>
        <h1 className="font-display mt-2 text-4xl font-black">Confirm your subscription</h1>
        <p className="mt-3 text-white/60">Secure checkout powered by Paddle. Paddle is the Merchant of Record for your payment.</p>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Account</div>
          <div className="mt-1 text-lg">{email}</div>
          <div className="my-6 h-px bg-white/10" />
          <div className="flex items-baseline justify-between gap-5">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Plan</div>
              <div className="mt-1 text-lg">{selectedPlan.label}</div>
              <div className="text-sm text-white/60">{selectedPlan.referencePrice} {selectedPlan.period}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Paddle checkout</div>
              <div className="font-display mt-1 text-3xl font-black">{selectedPlan.chargedPrice}</div>
              <div className="text-xs text-white/45">{selectedPlan.total}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e9b149]/30 bg-[#e9b149]/[0.06] p-5 text-sm text-[#f4d68b]">
          <div className="font-semibold text-[#e9b149]">Currency note</div>
          <p className="mt-1 text-white/70">Paddle does not support GEL settlement, so the secure checkout charges the USD amount shown above. GEL amounts are local reference prices.</p>
        </div>

        {error && <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}

        <button
          type="button"
          disabled={busy}
          onClick={() => void startCheckout()}
          className="font-display mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-[#3b82f6] text-base font-bold text-white shadow-[0_10px_40px_-10px_rgba(59,130,246,0.7)] hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "Opening secure checkout…" : `Pay ${selectedPlan.chargedPrice} and start membership →`}
        </button>
        <p className="mt-3 text-center text-xs text-white/40">Your membership activates after Paddle confirms payment.</p>
        <div className="mt-7 flex justify-center gap-3 text-xs text-white/40">
          <button type="button" onClick={() => setPlan("monthly")} className={plan === "monthly" ? "text-white" : "hover:text-white"}>Monthly</button>
          <span aria-hidden>·</span>
          <button type="button" onClick={() => setPlan("quarterly")} className={plan === "quarterly" ? "text-white" : "hover:text-white"}>3 months</button>
        </div>
        <p className="mt-4 text-center text-xs text-white/30">Environment: {getPaddleEnvironment() === "sandbox" ? "test" : "live"}</p>
      </main>
    </div>
  );
}
