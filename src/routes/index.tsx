import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import heroImg from "@/assets/hero-dashboard.jpg";
import pairingImg from "@/assets/feature-pairing.jpg";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "MyTesla.ge — Real navigation for imported Teslas in Georgia" },
      {
        name: "description",
        content:
          "Skip Tesla Premium Connectivity. Get real, live turn-by-turn navigation on your Tesla's screen — built for imported cars in Georgia. 25 ₾/month.",
      },
      { property: "og:title", content: "MyTesla.ge — The navigation your Tesla should have" },
      {
        property: "og:description",
        content:
          "Real GPS. Real routes. Real Georgian streets. From 25 ₾/month — no Premium Connectivity required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  return (
    <div className="min-h-screen bg-[#050708] text-white">
      <Nav signedIn={signedIn} />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(59,130,246,0.18),transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_40%_at_100%_100%,rgba(233,177,73,0.10),transparent_70%)]" />
        <div className="mx-auto grid max-w-[1200px] gap-10 px-6 pb-20 pt-24 lg:grid-cols-[1.05fr_1fr] lg:pt-32">
          <div className="animate-fade-in">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/70">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e9b149]" />
              For imported Teslas · Georgia
            </div>
            <h1 className="font-display text-5xl font-black leading-[1.02] tracking-tight md:text-6xl lg:text-7xl">
              The navigation
              <br />
              your Tesla{" "}
              <span className="bg-gradient-to-r from-[#3b82f6] via-[#60a5fa] to-[#e9b149] bg-clip-text text-transparent">
                should have.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              Tesla's built-in maps don't work correctly on imported cars in Georgia. Premium
              Connectivity costs <span className="text-white">$99/year</span> and still won't fix
              it. We built the alternative — a real, live map that runs right on your Tesla's
              screen.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/pricing"
                className="font-display group inline-flex h-14 items-center justify-center rounded-2xl bg-[#3b82f6] px-7 text-base font-bold text-white shadow-[0_10px_40px_-10px_rgba(59,130,246,0.7)] transition hover:brightness-110"
              >
                Start from 25 ₾/mo
                <span className="ml-2 transition group-hover:translate-x-1">→</span>
              </Link>
              <Link
                to="/drive"
                className="font-display inline-flex h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.03] px-6 text-base font-semibold text-white hover:bg-white/[0.08]"
              >
                Try the map →
              </Link>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-6 text-sm">
              <Stat n="±3 m" l="Live GPS via phone" />
              <Stat n="17″" l="Optimized for Tesla" />
              <Stat n="0" l="Extra hardware" />
            </dl>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-[#3b82f6]/30 to-[#e9b149]/20 blur-2xl" />
            <div className="animate-scale-in relative overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl">
              <img
                src={heroImg}
                alt="Tesla Model 3 dashboard showing live navigation in Tbilisi"
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
            eyebrow="The problem"
            title="Tesla Premium Connectivity — 990 ₾/year"
            bullets={[
              "Still doesn't route correctly on imported cars in Georgia",
              "Ties you into a subscription for features you already paid for",
              "Locked to Tesla's aging map data outside supported countries",
            ]}
          />
          <Card
            tone="good"
            eyebrow="The solution"
            title="MyTesla.ge — 25 ₾/month"
            bullets={[
              "Google-quality maps that actually know Georgian streets",
              "Real-time GPS from your phone → your car's 17″ screen",
              "Live traffic, alternates, auto-rerouting, HUD mode",
            ]}
          />
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24">
        <div className="mx-auto max-w-[1200px] px-6">
          <h2 className="font-display max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            Built for the car, powered by your phone.
          </h2>
          <p className="mt-4 max-w-2xl text-white/60">
            Pair once with a QR code. Your phone streams high-accuracy GPS to the Tesla browser;
            the Tesla shows the live map. That's it — no app store, no cable, no CarPlay hack.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <Feature
              icon="📍"
              title="Real GPS, live"
              body="Your phone's chip is far more accurate than a browser. We stream it to the car in real time."
            />
            <Feature
              icon="🧭"
              title="Turn-by-turn HUD"
              body="Full-screen navigation with giant ETA, distance, and speed — designed to read at a glance."
            />
            <Feature
              icon="⚡"
              title="Traffic & rerouting"
              body="Live traffic layer, alternate routes, and automatic rerouting when you drift off course."
            />
            <Feature
              icon="🔋"
              title="Supercharger planning"
              body="Enter your battery %, and we'll plan charging stops along the way."
            />
            <Feature
              icon="🇬🇪"
              title="Local streets"
              body="Georgian addresses, Tbilisi backroads, unpaved-road warnings — tuned for the country."
            />
            <Feature
              icon="🔒"
              title="Membership only"
              body="One account, one device. Your subscription can't be shared to another car."
            />
          </div>

          <div className="mt-16 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]">
            <img
              src={pairingImg}
              alt="Phone pairing with Tesla screen via QR code"
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
              Pricing
            </div>
            <h2 className="font-display text-4xl font-black md:text-5xl">
              One price. Half of what Tesla charges.
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <PricingCard
              title="Monthly"
              price="25 ₾"
              period="/month"
              tag="Cancel anytime"
              features={["Live in-car map", "Phone GPS pairing", "Turn-by-turn HUD", "Traffic & rerouting"]}
              cta="Start monthly"
              to="/pricing"
            />
            <PricingCard
              highlighted
              title="3 months upfront"
              price="60 ₾"
              period=" total"
              subprice="20 ₾/mo · save 20%"
              tag="Best value"
              features={[
                "Everything in Monthly",
                "20% off vs paying month-to-month",
                "One payment, three months",
                "Priority support",
              ]}
              cta="Save 20% →"
              to="/pricing"
            />
          </div>
          <p className="mt-6 text-center text-sm text-white/50">
            Compare: Tesla Premium Connectivity ≈ 990 ₾/year and still doesn't route Georgia.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#050708]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <Link to="/" className="font-display flex items-center gap-2 text-lg font-black tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#e9b149] text-black">
            ⚡
          </span>
          MyTesla<span className="text-white/40">.ge</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
          <a href="#pricing" className="hover:text-white">Pricing</a>
          <Link to="/drive" className="hover:text-white">Live demo</Link>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link
              to="/drive"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Open app →
            </Link>
          ) : (
            <>
              <Link to="/auth" className="hidden text-sm text-white/70 hover:text-white sm:inline">
                Sign in
              </Link>
              <Link
                to="/pricing"
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
              >
                Get started
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
  bullets: string[];
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
}: {
  title: string;
  price: string;
  period: string;
  subprice?: string;
  tag: string;
  features: string[];
  cta: string;
  to: string;
  highlighted?: boolean;
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
          Save 20%
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

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10 text-center text-xs text-white/40">
      © {new Date().getFullYear()} MyTesla.ge · Made for Tesla owners in Georgia
    </footer>
  );
}
