import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getMembershipState } from "@/lib/bog.functions";

export const Route = createFileRoute("/checkout/success")({
  component: CheckoutSuccess,
  head: () => ({
    meta: [
      { title: "Payment complete | Tesla Map Georgia" },
      { name: "description", content: "Your Tesla Map Georgia membership payment is complete." },
      { property: "og:title", content: "Payment complete | Tesla Map Georgia" },
      { property: "og:description", content: "Your Tesla Map Georgia membership payment is complete." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CheckoutSuccess() {
  // The redirect back from the bank is not proof of payment — only the
  // verified callback, reflected in our own database, activates a membership.
  const [state, setState] = useState<"checking" | "active" | "waiting">("checking");
  const attempts = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const result = await getMembershipState();
        if (cancelled) return;
        if (result.active) {
          setState("active");
          return;
        }
      } catch {
        /* keep waiting */
      }
      if (cancelled) return;
      attempts.current += 1;
      if (attempts.current >= 20) {
        setState("waiting");
        return;
      }
      setState((s) => (s === "active" ? s : "checking"));
      timer = setTimeout(() => void poll(), 3000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-[#050708] px-6 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        {state === "active" ? (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-400/15 text-2xl text-emerald-300">✓</div>
            <h1 className="font-display mt-5 text-3xl font-black">Payment successful</h1>
            <p className="mt-3 text-white/65">Your membership is active. Enjoy the drive.</p>
            <Link to="/map" className="font-display mt-7 inline-flex h-12 items-center justify-center rounded-xl bg-[#3b82f6] px-6 font-bold text-white hover:brightness-110">
              Open Tesla Map
            </Link>
          </>
        ) : state === "checking" ? (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            <h1 className="font-display mt-5 text-3xl font-black">Confirming your payment…</h1>
            <p className="mt-3 text-white/65">We are waiting for the bank to confirm. This usually takes a few seconds.</p>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-400/15 text-2xl text-amber-300">⏳</div>
            <h1 className="font-display mt-5 text-3xl font-black">Still confirming</h1>
            <p className="mt-3 text-white/65">
              The bank has not confirmed your payment yet. Keep this page open or come back in a few minutes — your membership
              starts automatically once the confirmation arrives.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-display mt-7 inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-6 font-bold text-white hover:bg-white/5"
            >
              Check again
            </button>
          </>
        )}
      </section>
    </main>
  );
}
