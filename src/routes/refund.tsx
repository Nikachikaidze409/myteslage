import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/refund")({
  component: RefundPage,
  head: () => ({
    meta: [
      { title: "Refund Policy - Tesla Map Georgia" },
      {
        name: "description",
        content:
          "30-day money-back guarantee for Tesla Map Georgia subscriptions, processed by Paddle.",
      },
    ],
  }),
});

function RefundPage() {
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

      <main className="mx-auto max-w-[760px] px-6 pb-24 pt-12 text-sm leading-7 text-white/75 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_p]:mb-3">
        <h1 className="font-display text-4xl font-black text-white">Refund Policy</h1>
        <p className="mt-2 text-white/40">Last updated: August 2026</p>

        <h2>30-day money-back guarantee</h2>
        <p>
          If you're not satisfied with your Tesla Map Georgia subscription,
          you can request a full refund within <strong>30 days</strong> of
          your order date — no questions asked.
        </p>

        <h2>How to request a refund</h2>
        <p>
          Refunds are processed by our payment provider, Paddle (our Merchant
          of Record). To request a refund:
        </p>
        <ul>
          <li>
            Visit{" "}
            <a
              href="https://paddle.net"
              target="_blank"
              rel="noreferrer"
              className="text-[#3b82f6] underline"
            >
              paddle.net
            </a>{" "}
            and look up your order, or
          </li>
          <li>
            Contact our support team via the email shown on our website and we
            will process it for you.
          </li>
        </ul>
        <p>
          Approved refunds are returned to your original payment method.
          Processing time depends on your bank or card issuer.
        </p>

        <h2>Cancellations</h2>
        <p>
          You can cancel your subscription at any time from your account.
          Cancellation stops future renewals; your access continues until the
          end of the current paid period. Cancelling does not remove the
          30-day refund right described above for recent orders.
        </p>
      </main>
    </div>
  );
}
