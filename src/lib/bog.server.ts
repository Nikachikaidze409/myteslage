// Bank of Georgia E-Commerce (Payments API v1) — SERVER ONLY.
//
// Nothing in this module may ever reach the browser: it handles the merchant
// credentials (BOG_CLIENT_ID / BOG_CLIENT_SECRET), the OAuth bearer token and
// the trusted price list.
//
// Docs: https://api.bog.ge/docs/payments/introduction

import { createVerify } from "crypto";

export const BOG_OAUTH_URL =
  "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";
export const BOG_ORDERS_URL = "https://api.bog.ge/payments/v1/ecommerce/orders";
export const BOG_RECEIPT_URL = "https://api.bog.ge/payments/v1/receipt";

export const BOG_CALLBACK_URL = "https://teslanavi.online/api/public/payments/bog/callback";
export const BOG_SUCCESS_BASE_URL = "https://teslanavi.online/checkout/success";

/** Success redirect tied to the specific, opaque payment attempt. */
export function bogSuccessUrl(externalOrderId: string): string {
  return `${BOG_SUCCESS_BASE_URL}?provider=bog&order=${encodeURIComponent(externalOrderId)}`;
}
export const BOG_FAIL_URL = "https://teslanavi.online/checkout?payment=failed";

/* ------------------------------------------------------------------ *
 * Trusted plan configuration. The browser may only name a plan key.
 * ------------------------------------------------------------------ */

export type PlanKey = "monthly" | "quarterly";

export interface BogPlan {
  id: string;
  amount: number;
  currency: "GEL";
  durationMonths: number;
  description: string;
}

export const BOG_PLANS: Record<PlanKey, BogPlan> = {
  monthly: {
    id: "tesla_map_georgia_monthly",
    amount: 8.0,
    currency: "GEL",
    durationMonths: 1,
    description: "TeslaNavi membership — 1 month",
  },
  quarterly: {
    id: "tesla_map_georgia_quarterly",
    amount: 21.6,
    currency: "GEL",
    durationMonths: 3,
    description: "TeslaNavi membership — 3 months",
  },
};

export function isPlanKey(value: unknown): value is PlanKey {
  return value === "monthly" || value === "quarterly";
}

/** Formats an amount the way BOG expects it in JSON (2 decimals, number). */
export function bogAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Period end for a freshly activated membership. */
export function computePeriodEnd(plan: PlanKey, start: Date): Date {
  const end = new Date(start.getTime());
  end.setMonth(end.getMonth() + BOG_PLANS[plan].durationMonths);
  return end;
}

/* ------------------------------------------------------------------ *
 * OAuth — client credentials, cached in server memory.
 * ------------------------------------------------------------------ */

let tokenCache: { token: string; expiresAt: number } | null = null;

/** Exposed for tests only. */
export function resetBogTokenCache(): void {
  tokenCache = null;
}

export async function getBogAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.token;

  const clientId = (process.env["BOG_CLIENT_ID"] ?? "").trim();
  const clientSecret = (process.env["BOG_CLIENT_SECRET"] ?? "").trim();
  if (!clientId || !clientSecret) {
    throw new Error("Bank of Georgia credentials are not configured");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(BOG_OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    // Parse the OAuth error envelope WITHOUT leaking credential material.
    // Only HTTP status + error + error_description are surfaced; never the
    // client id, secret, Authorization header, base64 creds, or access token.
    let error: string | null = null;
    let errorDescription: string | null = null;
    try {
      const body = (await response.json()) as {
        error?: string;
        error_description?: string;
      } | null;
      error = typeof body?.error === "string" ? body.error : null;
      errorDescription =
        typeof body?.error_description === "string" ? body.error_description : null;
    } catch {
      // Non-JSON or unparseable body — fall through with nulls.
    }
    const reason = error ?? errorDescription;
    console.error(
      `[BOG] auth failed status=${response.status}` +
        (error ? ` error=${error}` : "") +
        (errorDescription ? ` error_description=${errorDescription}` : ""),
    );
    const message = reason
      ? `Bank of Georgia authentication failed (${response.status}: ${reason})`
      : `Bank of Georgia authentication failed (${response.status})`;
    throw new Error(message);
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Bank of Georgia authentication returned no token");

  const ttl = Math.max(30, (json.expires_in ?? 300) - 60);
  tokenCache = { token: json.access_token, expiresAt: now + ttl * 1000 };
  return json.access_token;
}

/* ------------------------------------------------------------------ *
 * Order creation.
 * ------------------------------------------------------------------ */

export interface BogOrderPayload {
  callback_url: string;
  external_order_id: string;
  capture: "automatic";
  application_type: "web";
  purchase_units: {
    currency: string;
    total_amount: number;
    basket: Array<{
      quantity: number;
      unit_price: number;
      product_id: string;
      description: string;
    }>;
  };
  redirect_urls: { success: string; fail: string };
}

/**
 * Builds the create-order body strictly from the trusted plan table.
 * No caller-supplied amount or currency is ever accepted here.
 */
export function buildOrderPayload(plan: PlanKey, externalOrderId: string): BogOrderPayload {
  const config = BOG_PLANS[plan];
  const price = bogAmount(config.amount);
  return {
    callback_url: BOG_CALLBACK_URL,
    external_order_id: externalOrderId,
    capture: "automatic",
    application_type: "web",
    purchase_units: {
      currency: config.currency,
      total_amount: price,
      basket: [
        {
          quantity: 1,
          unit_price: price,
          product_id: config.id,
          description: config.description,
        },
      ],
    },
    redirect_urls: { success: bogSuccessUrl(externalOrderId), fail: BOG_FAIL_URL },
  };
}

export interface BogCreatedOrder {
  orderId: string;
  redirectUrl: string;
}

interface BogOrderResponse {
  id?: string;
  _links?: { redirect?: { href?: string }; details?: { href?: string } };
}

/** Pulls order id + hosted-checkout URL out of BOG's create-order response. */
export function extractCreatedOrder(json: unknown): BogCreatedOrder | null {
  const data = json as BogOrderResponse | null;
  const orderId = data?.id;
  const redirectUrl = data?._links?.redirect?.href;
  if (!orderId || !redirectUrl) return null;
  return { orderId, redirectUrl };
}

export async function createBogOrder(payload: BogOrderPayload): Promise<BogCreatedOrder> {
  const token = await getBogAccessToken();
  const response = await fetch(BOG_ORDERS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept-Language": "en",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`[BOG] create order failed with status ${response.status}`);
    throw new Error("Could not start the bank checkout. Please try again.");
  }

  const created = extractCreatedOrder(await response.json());
  if (!created) throw new Error("The bank did not return a checkout link.");
  return created;
}

/* ------------------------------------------------------------------ *
 * Payment details (independent verification).
 * ------------------------------------------------------------------ */

export interface BogPaymentDetails {
  orderId: string | null;
  statusKey: string | null;
  amount: number | null;
  currency: string | null;
  externalOrderId: string | null;
}

export function parsePaymentDetails(json: unknown): BogPaymentDetails {
  const d = json as
    | {
        order_id?: string;
        external_order_id?: string;
        order_status?: { key?: string };
        purchase_units?: {
          request_amount?: string | number;
          transfer_amount?: string | number;
          currency_code?: string;
        };
      }
    | null;
  const raw = d?.purchase_units?.transfer_amount ?? d?.purchase_units?.request_amount;
  const amount = raw == null ? null : Number(raw);
  return {
    orderId: d?.order_id ?? null,
    statusKey: d?.order_status?.key ?? null,
    amount: Number.isFinite(amount as number) ? (amount as number) : null,
    currency: d?.purchase_units?.currency_code ?? null,
    externalOrderId: d?.external_order_id ?? null,
  };
}

export async function fetchBogPaymentDetails(orderId: string): Promise<BogPaymentDetails> {
  const token = await getBogAccessToken();
  const response = await fetch(`${BOG_RECEIPT_URL}/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}`, "Accept-Language": "en" },
  });
  if (!response.ok) {
    console.error(`[BOG] payment details failed with status ${response.status}`);
    throw new Error("Could not verify the payment with the bank.");
  }
  return parsePaymentDetails(await response.json());
}

/** Every condition that must hold before a membership is activated. */
export function paymentMatchesOrder(
  details: BogPaymentDetails,
  order: {
    provider_order_id: string | null;
    external_order_id: string | null;
    amount: number | string;
    currency: string;
  },
): boolean {
  if (details.statusKey !== "completed") return false;
  if (!details.orderId || details.orderId !== order.provider_order_id) return false;
  if (!details.externalOrderId || details.externalOrderId !== order.external_order_id) return false;
  if (details.currency !== "GEL" || order.currency !== "GEL") return false;
  if (details.amount == null) return false;
  return Math.abs(details.amount - Number(order.amount)) < 0.005;
}

/* ------------------------------------------------------------------ *
 * Callback signature — RSA SHA256 over the RAW body.
 * ------------------------------------------------------------------ */

export const BOG_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4RUyAw3+CdkS3ZNILQh
zHI9Hemo+vKB9U2BSabppkKjzjjkf+0Sm76hSMiu/HFtYhqWOESryoCDJoqffY0Q
1VNt25aTxbj068QNUtnxQ7KQVLA+pG0smf+EBWlS1vBEAFbIas9d8c9b9sSEkTrr
TYQ90WIM8bGB6S/KLVoT1a7SnzabjoLc5Qf/SLDG5fu8dH8zckyeYKdRKSBJKvhx
tcBuHV4f7qsynQT+f2UYbESX/TLHwT5qFWZDHZ0YUOUIvb8n7JujVSGZO9/+ll/g
4ZIWhC1MlJgPObDwRkRd8NFOopgxMcMsDIZIoLbWKhHVq67hdbwpAq9K9WMmEhPn
PwIDAQAB
-----END PUBLIC KEY-----`;

/** Verifies the Callback-Signature header against the RAW request body. */
export function verifyCallbackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  try {
    return createVerify("RSA-SHA256").update(rawBody, "utf8").verify(
      BOG_PUBLIC_KEY,
      signature,
      "base64",
    );
  } catch {
    return false;
  }
}
