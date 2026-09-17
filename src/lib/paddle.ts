import { resolvePaddlePrice } from "@/lib/payments.functions";
import { resolvePaddleEnvironment } from "@/lib/membership";
import { trackPurchaseOnce } from "@/lib/meta-pixel";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

declare global {
  interface Window {
    Paddle?: any;
  }
}

export function getPaddleEnvironment(): "sandbox" | "live" {
  return resolvePaddleEnvironment(clientToken);
}

let paddleInitialized = false;
let paddleInitialization: Promise<void> | null = null;

export function initializePaddle(): Promise<void> {
  if (paddleInitialized) return Promise.resolve();
  if (paddleInitialization) return paddleInitialization;
  if (!clientToken) return Promise.reject(new Error("Payment checkout is not configured yet."));

  paddleInitialization = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-paddle="true"]');
    const script = existing ?? document.createElement("script");
    const finish = () => {
      if (!window.Paddle) {
        reject(new Error("Payment checkout could not load."));
        return;
      }
      window.Paddle.Environment.set(getPaddleEnvironment() === "sandbox" ? "sandbox" : "production");
      window.Paddle.Initialize({
        token: clientToken,
        // Paddle tells us the moment the overlay payment completes, so the
        // Purchase event is reported even if the user never reaches the
        // success page. trackPurchaseOnce de-duplicates by transaction id.
        eventCallback: (event: any) => {
          if (event?.name !== "checkout.completed") return;
          const data = event.data ?? {};
          const value = Number(data.totals?.total ?? data.totals?.grand_total);
          const currency = String(data.currency_code ?? "USD");
          const id = String(data.transaction_id ?? data.id ?? "");
          if (id && Number.isFinite(value)) trackPurchaseOnce(`paddle:${id}`, value, currency);
        },
      });
      paddleInitialized = true;
      resolve();
    };

    if (existing) {
      if (window.Paddle) finish();
      else script.addEventListener("load", finish, { once: true });
      script.addEventListener("error", () => reject(new Error("Payment checkout could not load.")), { once: true });
      return;
    }

    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.dataset.paddle = "true";
    script.onload = finish;
    script.onerror = () => reject(new Error("Payment checkout could not load."));
    document.head.appendChild(script);
  }).finally(() => {
    paddleInitialization = null;
  });

  return paddleInitialization;
}

export async function getPaddlePriceId(priceId: string): Promise<string> {
  return resolvePaddlePrice({ data: { priceId, environment: getPaddleEnvironment() } });
}
