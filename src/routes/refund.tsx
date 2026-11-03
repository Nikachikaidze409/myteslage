import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/refund")({
  component: RefundPage,
  head: () => ({
    meta: [
      { title: "Refund Policy - TMap Georgia" },
      {
        name: "description",
        content:
          "TMap Georgia payments are non-refundable; cancel anytime by messaging us.",
      },
      { property: "og:title", content: "Refund Policy - TMap Georgia" },
      { property: "og:description", content: "TMap Georgia payments are non-refundable; cancel anytime by messaging us." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://tmap.ge/refund" }],
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
            TMap Georgia
          </Link>
          <Link to="/" className="text-sm text-white/60 hover:text-white">
            ← Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-6 pb-24 pt-12 text-sm leading-7 text-white/75 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_p]:mb-3">
        <h1 className="font-display text-4xl font-black text-white">Refund Policy</h1>
        <p className="mt-2 text-white/40">Last updated: November 2026</p>

        <h2>თანხა არ ბრუნდება</h2>
        <p>
          TMap Georgia-ზე განხორციელებული ყველა გადახდა — როგორც პირველადი
          შეძენა, ისე ავტომატური განახლება — საბოლოოა და თანხა უკან არ
          ბრუნდება.
        </p>

        <h2>გამოწერის გათიშვა</h2>
        <p>
          გამოწერის ან ავტომატური განახლების გასათიშად მოგვწერეთ ან
          დაგვირეკეთ ნებისმიერ სოციალურ ქსელში, მობილურზე ან ელფოსტით —
          გამოწერას გავთიშავთ და შემდეგი ჩამოჭრა აღარ მოხდება. წვდომა
          გრძელდება უკვე გადახდილი პერიოდის ბოლომდე.
        </p>
        <p>
          ყველაზე სწრაფი გზაა მოგვწეროთ{" "}
          <a
            href="https://www.facebook.com/profile.php?id=61594077238294"
            target="_blank"
            rel="noreferrer"
            className="text-[#3b82f6] underline"
          >
            ჩვენს Facebook გვერდზე
          </a>
          .
        </p>

        <h2>No refunds (English)</h2>
        <p>
          All payments — first purchases and automatic renewals — are final and
          non-refundable. To stop your subscription, message or call us on any
          social network, by phone, or by email and we will turn off future
          renewals; access continues until the end of the paid period. The
          fastest way is to message our{" "}
          <a
            href="https://www.facebook.com/profile.php?id=61594077238294"
            target="_blank"
            rel="noreferrer"
            className="text-[#3b82f6] underline"
          >
            Facebook page
          </a>
          .
        </p>

        <h2>Independent product</h2>
        <p>
          TMap Georgia is an independent product and is not affiliated with or endorsed by Tesla, Inc.
        </p>
      </main>
    </div>
  );
}
