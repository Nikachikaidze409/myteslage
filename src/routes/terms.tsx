import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms & Conditions - Tesla Map Georgia" },
      {
        name: "description",
        content:
          "Terms of service for the Tesla Map Georgia in-car navigation web application.",
      },
    ],
  }),
});

function TermsPage() {
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
        <h1 className="font-display text-4xl font-black text-white">Terms & Conditions</h1>
        <p className="mt-2 text-white/40">Last updated: August 2026</p>

        <h2>1. Agreement</h2>
        <p>
          These terms are between you and tesla map georgia ("we", "us"). By
          creating an account or continuing to use the Tesla Map Georgia
          service, you agree to these terms. You confirm you are of legal age
          and, if using the service on behalf of an organisation, that you
          have authority to bind it.
        </p>

        <h2>2. The service</h2>
        <p>
          Tesla Map Georgia is a browser-based live navigation application for
          imported Tesla vehicles in Georgia, including GPS guidance, route
          preview, phone GPS pairing, traffic-aware routing, and supercharger
          stop planning.
        </p>

        <h2>3. Payment and subscriptions</h2>
        <p>
          Our order process is conducted by our online reseller Paddle.com.
          Paddle.com is the Merchant of Record for all our orders. Paddle
          provides all customer service inquiries and handles returns. Payment,
          billing, taxes, cancellation, and refund mechanics are governed by{" "}
          <a
            href="https://www.paddle.com/legal/checkout-buyer-terms"
            target="_blank"
            rel="noreferrer"
            className="text-[#3b82f6] underline"
          >
            Paddle's Buyer Terms
          </a>
          .
        </p>

        <h2>4. Acceptable use</h2>
        <p>You must not misuse the service, including:</p>
        <ul>
          <li>unlawful use, fraud, or spam;</li>
          <li>infringing intellectual property rights;</li>
          <li>interfering with security (malware, probing, scraping, circumvention of technical limits);</li>
          <li>reverse engineering, reselling, or redistributing the service;</li>
          <li>sharing your account credentials — one account is licensed for one device.</li>
        </ul>

        <h2>5. Intellectual property</h2>
        <p>
          We retain all ownership of the service and its IP, including
          software, design, documentation, and branding. We grant you a
          limited, non-exclusive, non-transferable right to use the service
          within your subscription plan.
        </p>

        <h2>6. Account credentials</h2>
        <p>
          You must keep your credentials confidential, provide accurate
          information, and are responsible for all activity under your
          account.
        </p>

        <h2>7. Service level</h2>
        <p>
          We do not guarantee uninterrupted or error-free performance. The
          service is provided "as is"; to the fullest extent permitted by law
          we disclaim implied warranties of merchantability and fitness for a
          particular purpose. Navigation guidance is an aid — you remain fully
          responsible for safe and lawful driving.
        </p>

        <h2>8. Suspension and termination</h2>
        <p>
          We may suspend or terminate access for material breach, non-payment,
          security or fraud risk, or repeated or serious violations of these
          terms. On termination, your access ends and your data is handled per
          our Privacy Notice.
        </p>

        <h2>9. Liability</h2>
        <p>
          To the fullest extent permitted by law, our aggregate liability is
          capped at the fees you paid in the 12 months before the claim, and
          we exclude liability for indirect, consequential, or special damages
          (including loss of profits, data, or goodwill). Nothing in these
          terms excludes liability for fraud, death, or personal injury where
          the law does not allow it.
        </p>

        <h2>10. General</h2>
        <p>
          These terms are governed by the laws of Georgia. Disputes will be
          resolved in the courts of Tbilisi, Georgia. You may not assign these
          terms without our consent; we may assign them in connection with a
          merger or acquisition. We are not liable for delays caused by events
          beyond our reasonable control.
        </p>
      </main>
    </div>
  );
}
