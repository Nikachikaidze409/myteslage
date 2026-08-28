import { resolvePaddlePrice } from "@/lib/payments.functions";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

declare global {
  interface Window {
    Paddle?: any;
  }
}

export function getPaddleEnvironment(): "sandbox" | "live" {
  return clientToken?.startsWith("test_") ? "sandbox" : "live";
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
      window.Paddle.Initialize({ token: clientToken });
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
