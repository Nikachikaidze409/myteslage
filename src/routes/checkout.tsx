import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { saveProfileDetails } from "@/lib/auth.functions";
import { createBogCheckout } from "@/lib/bog.functions";
import { initializePaddle, getPaddlePriceId } from "@/lib/paddle";
import {
  PROVIDER_KEY,
  PROVIDER_LABELS,
  PROVIDER_NOTES,
  checkoutButtonLabel,
  providerPrice,
  readStoredProvider,
  startProviderCheckout,
  type PaymentProvider,
  type Plan,
} from "@/lib/checkout-provider";
import { AccountBar } from "@/components/AccountBar";

const PLAN_KEY = "tsl.pending-plan";
const PLANS: Record<Plan, { label: string; period: string }> = {
  monthly: { label: "Monthly", period: "per month" },
  quarterly: { label: "3 months · save 10%", period: "every 3 months" },
};

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({
    meta: [
      { title: "Secure checkout | Tesla Map Georgia" },
      { name: "description", content: "Start your Tesla Map Georgia membership with secure Bank of Georgia checkout." },
      { property: "og:title", content: "Secure checkout | Tesla Map Georgia" },
      { property: "og:description", content: "Start your Tesla Map Georgia membership with secure Bank of Georgia checkout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Checkout() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan>("quarterly");
  const [provider, setProvider] = useState<PaymentProvider>("bog");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("payment") === "failed") {
      setError("The payment was not completed. You can try again below.");
    }
    const stored = window.localStorage.getItem(PLAN_KEY);
    if (stored === "monthly" || stored === "quarterly") setPlan(stored);

    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(session.user.email ?? "");
      setUserId(session.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", session.user.id)
        .maybeSingle();
      setFullName(profile?.full_name ?? "");
      setPhone(profile?.phone ?? "");
      setLoading(false);
    });
  }, [navigate]);

  const startCheckout = async () => {
    if (!userId) return;
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }
    if (!phone.trim() || phone.trim().length < 5) {
      setError("Please enter a valid mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveProfileDetails({ data: { fullName: fullName.trim(), phone: phone.trim() } });
      // The browser sends only the plan name — never a price.
      const result = await createBogCheckout({ data: { plan } });
      window.location.assign(result.redirectUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not open. Please try again.");
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
        <p className="mt-3 text-white/60">Secure checkout powered by Bank of Georgia. Card details are entered on the bank's own payment page.</p>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Account</div>
          <div className="mt-1 text-lg">{email}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-white/50">Full name</span>
              <input
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-base text-white placeholder:text-white/30"
                placeholder="Your name"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-white/50">Mobile number</span>
              <input
                type="tel"
                required
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 h-12 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-base text-white placeholder:text-white/30"
                placeholder="+995 5XX XXX XXX"
              />
            </label>
          </div>
          <div className="my-6 h-px bg-white/10" />
          <div className="flex items-baseline justify-between gap-5">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Plan</div>
              <div className="mt-1 text-lg">{selectedPlan.label}</div>
              <div className="text-sm text-white/60">{selectedPlan.period}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">Total</div>
              <div className="font-display mt-1 text-3xl font-black">{selectedPlan.price}</div>
            </div>
          </div>
        </div>

        {error && <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</div>}

        <button
          type="button"
          disabled={busy}
          onClick={() => void startCheckout()}
          className="font-display mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-[#3b82f6] text-base font-bold text-white shadow-[0_10px_40px_-10px_rgba(59,130,246,0.7)] hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "Opening secure checkout…" : `Pay ${selectedPlan.price} →`}
        </button>
        <p className="mt-3 text-center text-xs text-white/40">Your membership activates once the bank confirms the payment.</p>
        <div className="mt-7 flex justify-center gap-3 text-xs text-white/40">
          <button type="button" onClick={() => setPlan("monthly")} className={plan === "monthly" ? "text-white" : "hover:text-white"}>Monthly</button>
          <span aria-hidden>·</span>
          <button type="button" onClick={() => setPlan("quarterly")} className={plan === "quarterly" ? "text-white" : "hover:text-white"}>3 months</button>
        </div>
      </main>
    </div>
  );
}
