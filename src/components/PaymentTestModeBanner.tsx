import { getPaddleEnvironment } from "@/lib/paddle";

export function PaymentTestModeBanner() {
  if (getPaddleEnvironment() !== "sandbox") return null;

  return (
    <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-200">
      Test payments are enabled in this preview. No real money will be charged.
    </div>
  );
}
