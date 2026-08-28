import { getPaddleEnvironment } from "@/lib/paddle";

export function PaymentTestModeBanner() {
  if (getPaddleEnvironment() !== "sandbox") return null;

  return (
    <div className="border-b border-border bg-muted px-4 py-2 text-center text-xs text-muted-foreground">
      Test payments are enabled in this preview. No real money will be charged.
    </div>
  );
}
