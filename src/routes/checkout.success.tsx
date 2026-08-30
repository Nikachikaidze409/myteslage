import { createFileRoute, Link } from "@tanstack/react-router";

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
  return (
    <main className="grid min-h-screen place-items-center bg-[#050708] px-6 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-400/15 text-2xl text-emerald-300">✓</div>
        <h1 className="font-display mt-5 text-3xl font-black">Payment received</h1>
        <p className="mt-3 text-white/65">Your membership is being activated. Open the map once the payment confirmation arrives.</p>
        <Link to="/map" className="font-display mt-7 inline-flex h-12 items-center justify-center rounded-xl bg-[#3b82f6] px-6 font-bold text-white hover:brightness-110">
          Open Tesla Map
        </Link>
      </section>
    </main>
  );
}
