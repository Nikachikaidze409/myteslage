// Bank of Georgia E-Commerce (Payments API v1) — SERVER ONLY.
//
// Nothing in this module may ever reach the browser: it handles the merchant
// credentials (BOG_CLIENT_ID / BOG_CLIENT_SECRET), the OAuth bearer token and
// the trusted price list.
//
// Docs: https://api.bog.ge/docs/payments/introduction

import { createVerify } from "crypto";

export const BOG_OAUTH_URL = "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";
export const BOG_ORDERS_URL = "https://api.bog.ge/payments/v1/ecommerce/orders";
export const BOG_RECEIPT_URL = "https://api.bog.ge/payments/v1/receipt";
/** Save-card-for-automatic-payments (PUT /payments/v1/orders/{id}/subscriptions). */
export const BOG_SAVE_SUBSCRIPTION_URL = "https://api.bog.ge/payments/v1/orders";
/** Delete saved card (DELETE /payments/v1/charges/card/{parent_order_id}). */
export const BOG_DELETE_CARD_URL = "https://api.bog.ge/payments/v1/charges/card";

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

/**
 * Hosted-checkout payment methods we ask BOG to offer. All values are from the
 * official create-order documentation. Apple Pay / Google Pay are offered
 * ALONGSIDE card — never instead of it.
 */
export const BOG_PAYMENT_METHODS = [
  "card",
  "apple_pay",
  "google_pay",
  "bog_p2p",
  "bog_loyalty",
] as const;

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
  payment_method?: string[];
  // external:false = Apple Pay happens on the BANK's hosted page (not ours).
  config?: { apple_pay: { external: false } };
}

/**
 * Builds the create-order body strictly from the trusted plan table.
 * No caller-supplied amount or currency is ever accepted here.
 *
 * `trusted` is only ever produced by server-side proration (never by the
 * browser) and is used for a monthly -> quarterly upgrade price.
 */
export function buildOrderPayload(
  plan: PlanKey,
  externalOrderId: string,
  trusted?: { amount: number; description?: string },
): BogOrderPayload {
  const config = BOG_PLANS[plan];
  const price = bogAmount(trusted ? trusted.amount : config.amount);
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
          description: trusted?.description ?? config.description,
        },
      ],
    },
    redirect_urls: { success: bogSuccessUrl(externalOrderId), fail: BOG_FAIL_URL },
    payment_method: [...BOG_PAYMENT_METHODS],
    config: { apple_pay: { external: false } },
  };
}

export const BOG_UPGRADE_DESCRIPTION = "TeslaNavi 3-month membership upgrade";

/**
 * Fallback body used only if BOG rejects the explicit method list because one
 * of the methods is not activated on the merchant. With no payment_method BOG
 * offers every method the merchant actually has enabled, so checkout keeps
 * working instead of breaking.
 */
export function withoutExplicitPaymentMethods(payload: BogOrderPayload): BogOrderPayload {
  const { payment_method: _pm, config: _cfg, ...rest } = payload;
  return rest;
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

async function postOrder(
  payload: BogOrderPayload,
): Promise<{ ok: true; created: BogCreatedOrder } | { ok: false; status: number; body: string }> {
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
    let body = "";
    try {
      body = (await response.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    return { ok: false, status: response.status, body };
  }

  const created = extractCreatedOrder(await response.json());
  if (!created) throw new Error("The bank did not return a checkout link.");
  return { ok: true, created };
}

export async function createBogOrder(payload: BogOrderPayload): Promise<BogCreatedOrder> {
  const first = await postOrder(payload);
  if (first.ok) return first.created;

  console.error(
    `[BOG] create order failed with status ${first.status} (explicit payment methods: ${(payload.payment_method ?? []).join(",")}) body=${first.body}`,
  );

  // A rejected method list must never break a working checkout: retry once
  // letting BOG offer every method actually activated on the merchant.
  if (payload.payment_method) {
    const retry = await postOrder(withoutExplicitPaymentMethods(payload));
    if (retry.ok) {
      console.error(
        "[BOG] checkout created WITHOUT explicit payment_method — one of the requested methods is not activated on the merchant (see previous log line for the bank's message).",
      );
      return retry.created;
    }
    console.error(`[BOG] create order retry failed with status ${retry.status} body=${retry.body}`);
  }

  throw new Error("Could not start the bank checkout. Please try again.");
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
  /** Saved-card / recurring fields (payment_detail). */
  transferMethodKey: string | null;
  paymentOption: string | null;
  savedCardType: string | null;
  parentOrderId: string | null;
  code: string | null;
  codeDescription: string | null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parsePaymentDetails(json: unknown): BogPaymentDetails {
  const d = json as {
    order_id?: string;
    external_order_id?: string;
    order_status?: { key?: string };
    payment_detail?: {
      transfer_method?: { key?: string };
      payment_option?: string;
      saved_card_type?: string;
      parent_order_id?: string;
      code?: string;
      code_description?: string;
    };
    purchase_units?: {
      request_amount?: string | number;
      transfer_amount?: string | number;
      currency_code?: string;
    };
  } | null;
  const raw = d?.purchase_units?.transfer_amount ?? d?.purchase_units?.request_amount;
  const amount = raw == null ? null : Number(raw);
  const pd = d?.payment_detail;
  return {
    orderId: d?.order_id ?? null,
    statusKey: d?.order_status?.key ?? null,
    amount: Number.isFinite(amount as number) ? (amount as number) : null,
    currency: d?.purchase_units?.currency_code ?? null,
    externalOrderId: d?.external_order_id ?? null,
    transferMethodKey: str(pd?.transfer_method?.key),
    paymentOption: str(pd?.payment_option),
    savedCardType: str(pd?.saved_card_type),
    parentOrderId: str(pd?.parent_order_id),
    code: str(pd?.code),
    codeDescription: str(pd?.code_description),
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
    return createVerify("RSA-SHA256")
      .update(rawBody, "utf8")
      .verify(BOG_PUBLIC_KEY, signature, "base64");
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Automatic (saved-card) subscriptions.
 *
 * Docs:
 *   save card ...... PUT    /payments/v1/orders/{order_id}/subscriptions
 *   charge ......... POST   /payments/v1/ecommerce/orders/{parent}/subscribe
 *   delete card .... DELETE /payments/v1/charges/card/{parent}
 * ------------------------------------------------------------------ */

/** Trusted FULL recurring price per plan — never a prorated upgrade amount. */
export const BOG_RECURRING_AMOUNTS: Record<PlanKey, number> = {
  monthly: 8.0,
  quarterly: 21.6,
};

/**
 * A prorated upgrade must NEVER become the automatic-renewal parent: BOG reuses
 * the parent order's amount, so a 17.60 GEL upgrade would renew at 17.60 GEL.
 */
export function canBeAutoRenewParent(
  pricingReason: string | null | undefined,
  amount: number,
  plan: PlanKey,
): boolean {
  if (pricingReason === "monthly_to_quarterly_proration") return false;
  if (pricingReason !== "standard" && pricingReason != null) return false;
  return Math.abs(bogAmount(amount) - BOG_RECURRING_AMOUNTS[plan]) < 0.005;
}

/**
 * Asks BOG to save the card for automatic payments. A 202 only means the bank
 * ACCEPTED the request — it never proves a saved-card subscription exists and
 * must never enable auto-renew on its own.
 */
export async function enableBogAutomaticSubscription(orderId: string): Promise<boolean> {
  try {
    const token = await getBogAccessToken();
    const response = await fetch(
      `${BOG_SAVE_SUBSCRIPTION_URL}/${encodeURIComponent(orderId)}/subscriptions`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
      },
    );
    if (response.status === 202 || response.ok) return true;
    console.error(`[BOG] save-card request refused with status ${response.status}`);
    return false;
  } catch (error) {
    // Checkout must keep working: the user simply pays without auto-renew.
    console.error("[BOG] save-card request failed", (error as Error).message);
    return false;
  }
}

/**
 * Charges the saved card. NO amount, currency or basket is ever sent: BOG
 * reuses the trusted parent order's own amount and details.
 */
export async function createBogRenewalCharge(
  parentOrderId: string,
  externalOrderId: string,
): Promise<BogCreatedOrder> {
  const token = await getBogAccessToken();
  const response = await fetch(`${BOG_ORDERS_URL}/${encodeURIComponent(parentOrderId)}/subscribe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      callback_url: BOG_CALLBACK_URL,
      external_order_id: externalOrderId,
    }),
  });

  if (!response.ok) {
    let body = "";
    try {
      body = (await response.text()).slice(0, 500);
    } catch {
      /* ignore */
    }
    console.error(`[BOG] renewal charge failed with status ${response.status} body=${body}`);
    throw new Error("The bank refused the automatic payment.");
  }

  const json = (await response.json()) as {
    id?: string;
    _links?: { redirect?: { href?: string } };
  };
  if (!json.id) throw new Error("The bank did not return a renewal order id.");
  return { orderId: json.id, redirectUrl: json._links?.redirect?.href ?? "" };
}

/** Removes the saved card. BOG accepts the request with 202. */
export async function deleteBogSavedCard(parentOrderId: string): Promise<boolean> {
  try {
    const token = await getBogAccessToken();
    const response = await fetch(`${BOG_DELETE_CARD_URL}/${encodeURIComponent(parentOrderId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
    });
    if (response.status === 202 || response.ok) return true;
    console.error(`[BOG] delete saved card refused with status ${response.status}`);
    return false;
  } catch (error) {
    console.error("[BOG] delete saved card failed", (error as Error).message);
    return false;
  }
}

/** Everything a renewal receipt must prove before membership is extended. */
export function renewalPaymentMatches(
  details: BogPaymentDetails,
  order: {
    provider_order_id: string | null;
    external_order_id: string | null;
    amount: number | string;
    currency: string;
  },
  expected: { parentOrderId: string; plan: PlanKey },
): boolean {
  if (!paymentMatchesOrder(details, order)) return false;
  if (details.paymentOption !== "subscription") return false;
  if (!details.parentOrderId || details.parentOrderId !== expected.parentOrderId) return false;
  // Trusted full recurring price only — never a discounted amount.
  return Math.abs(Number(order.amount) - BOG_RECURRING_AMOUNTS[expected.plan]) < 0.005;
}

/**
 * Next period end for a renewal. The paid period is the anchor so no time is
 * lost; an anchor already in the past falls back to "now" so a late renewal can
 * never grant free historic time.
 */
export function computeRenewalPeriod(
  plan: PlanKey,
  anchor: string | Date | null,
  now: Date,
): { start: Date; end: Date } {
  const anchored = anchor ? new Date(anchor) : null;
  const valid =
    anchored && Number.isFinite(anchored.getTime()) && anchored.getTime() > now.getTime();
  const start = valid ? anchored! : now;
  return { start, end: computePeriodEnd(plan, start) };
}

/** Opaque TeslaNavi reference for a renewal attempt (carries no user id). */
export function newRenewalReference(): string {
  return `tsr_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
