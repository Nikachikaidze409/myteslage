import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Notice - Tesla Map Georgia" },
      {
        name: "description",
        content:
          "How tesla map georgia collects, uses, and protects your personal data.",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#050708] text-white">
      <header className="border-b border-white/5">
        <div className="mx-auto flex h-16 max-w-[900px] items-center justify-between px-6">
          <Link to="/" className="font-display flex items-center gap-2 text-lg font-black">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#e9b149] text-black">
              ⚡
            </span>
            Tesla Map Georgia
          </Link>
          <Link to="/" className="text-sm text-white/60 hover:text-white">
            ← Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-6 pb-24 pt-12 text-sm leading-7 text-white/75">
        <h1 className="font-display text-4xl font-black text-white">Privacy Notice</h1>
        <p className="mt-2 text-white/40">Last updated: August 2026</p>

        <h2>1. Who we are</h2>
        <p>
          tesla map georgia ("we", "us") is the data controller for the personal
          data processed through the Tesla Map Georgia web application. You can
          contact us at the support email shown on our website for any privacy
          question.
        </p>

        <h2>2. Data we collect</h2>
        <ul>
          <li><strong>Account data</strong> — email address, login credentials (hashed), account identifiers.</li>
          <li><strong>Location data</strong> — real-time GPS position from your device or your paired phone, used only to provide live navigation.</li>
          <li><strong>Usage data</strong> — pages viewed, routes searched, favorites and recent destinations you save, device identifiers, IP address.</li>
          <li><strong>Support data</strong> — messages you send to us.</li>
        </ul>

        <h2>3. Why we use it</h2>
        <ul>
          <li>Creating and managing your account (contract performance).</li>
          <li>Providing live navigation, routing, and phone-pairing features (contract performance).</li>
          <li>Security, fraud prevention, and abuse detection (legitimate interests).</li>
          <li>Improving the product through aggregated usage analytics (legitimate interests).</li>
          <li>Customer support (legitimate interests / contract performance).</li>
        </ul>

        <h2>4. Who we share data with</h2>
        <ul>
          <li><strong>Paddle</strong> — our Merchant of Record, for selling the product, subscription management, payment processing, tax compliance, and invoicing.</li>
          <li><strong>Service providers</strong> — hosting, database, mapping (Google Maps Platform), and analytics providers acting as processors on our behalf.</li>
          <li><strong>Professional advisers</strong> — legal and accounting advisers where needed.</li>
          <li><strong>Authorities</strong> — where required by law.</li>
        </ul>

        <h2>5. Retention</h2>
        <p>
          We keep personal data only as long as needed for the purposes above.
          Account data is kept while your account is active; navigation and
          usage data is deleted or anonymised when no longer needed. You may
          delete your account at any time, after which your data is removed
          except where the law requires retention.
        </p>

        <h2>6. Your rights</h2>
        <p>
          Depending on your location, you have the right to access, correct,
          delete, restrict, or port your personal data, to object to
          processing, and to withdraw consent where processing is based on
          consent. Contact us to exercise any of these rights; we respond
          within one month.
        </p>

        <h2>7. Security</h2>
        <p>
          We apply appropriate technical and organisational measures,
          including encryption in transit, access controls, and row-level
          isolation of user data.
        </p>

        <h2>8. Cookies</h2>
        <p>
          We use only essential storage (session and authentication tokens)
          required to keep you signed in and remember your preferences such as
          language. We do not use marketing cookies.
        </p>

        <h2>9. Changes</h2>
        <p>
          We may update this notice. Material changes will be announced in the
          app or by email.
        </p>
      </main>
    </div>
  );
}
