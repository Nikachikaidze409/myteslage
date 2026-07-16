import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PLAN_KEY = "tsl.pending-plan";

type Plan = "monthly" | "quarterly";

const PLANS: Record<Plan, { label: string; price: string; period: string; total: string }> = {
  monthly: { label: "Monthly", price: "8 ₾", period: "per month", total: "8 ₾ today" },
  quarterly: {
    label: "3 months (save 10%)",
    price: "21.60 ₾",
    period: "every 3 months",
    total: "21.60 ₾ today",
  },
};

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  head: () => ({ meta: [{ title: "Checkout — MyTesla.ge" }] }),
});

function Checkout() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan>("quarterly");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = (typeof window !== "undefined" && window.localStorage.getItem(PLAN_KEY)) as
      | Plan
      | null;
    if (stored === "monthly" || stored === "quarterly") setPlan(stored);

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(data.session.user.email ?? "");
      setLoading(false);
    });
  }, [navigate]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050708] text-white/60">
        Loading…
      </div>
    );
  }

  const p = PLANS[plan];

  return (
    <div className="min-h-screen bg-[#050708] text-white">
      <header className="border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-[900px] items-center justify-between px-6">
          <Link to="/" className="font-display flex items-center gap-2 text-lg font-black">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#e9b149] text-black">
              ⚡
            </span>
            MyTesla<span className="text-white/40">.ge</span>
          </Link>
          <Link to="/pricing" className="text-sm text-white/60 hover:text-white">
            ← Change plan
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-6 py-16">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[#e9b149]">
          Almost there
        </div>
        <h1 className="font-display mt-2 text-4xl font-black">Confirm your subscription</h1>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.02] p-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">
            Account
          </div>
          <div className="mt-1 text-lg">{email}</div>

          <div className="my-6 h-px bg-white/10" />

          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                Plan
              </div>
              <div className="mt-1 text-lg">{p.label}</div>
              <div className="text-sm text-white/60">
                {p.price} {p.period}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                Due today
              </div>
              <div className="font-display mt-1 text-3xl font-black">{p.total}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e9b149]/30 bg-[#e9b149]/[0.06] p-5 text-sm text-[#f4d68b]">
          <div className="font-semibold text-[#e9b149]">Payment activation in progress</div>
          <p className="mt-1 text-white/70">
            We're finalizing the Georgian payment gateway. In the meantime, click "Reserve my
            plan" below — we'll activate your account manually within 24 hours and send an invoice
            by email.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(
                "tsl.reserved-plan",
                JSON.stringify({ plan, email, at: Date.now() }),
              );
            } catch {
              /* ignore */
            }
            navigate({ to: "/drive" });
          }}
          className="font-display mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-[#3b82f6] text-base font-bold text-white shadow-[0_10px_40px_-10px_rgba(59,130,246,0.7)] hover:brightness-110"
        >
          Reserve my plan & try the app →
        </button>
        <p className="mt-3 text-center text-xs text-white/40">
          You'll be signed in and can start using the map right away.
        </p>
      </main>
    </div>
  );
}
