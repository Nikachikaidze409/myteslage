import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-side gate for every Google-billed endpoint (Routes, Places, Roads,
 * Geocoding).
 *
 * Access is granted to:
 *  - a signed-in admin;
 *  - a signed-in user with a valid subscription in the active Paddle env;
 *  - a paired phone presenting a live pairing code (the code's owner must
 *    itself have access).
 *
 * The UI paywall (AuthGate) is not security: this middleware runs before any
 * request reaches Google, so nobody can generate paid traffic by calling the
 * endpoints directly.
 */

const ACTIVE_STATUSES = ["active", "trialing", "past_due", "canceled"];

function paddleEnvironment(): string {
  const token = import.meta.env["VITE_PAYMENTS_CLIENT_TOKEN"] as string | undefined;
  return token?.startsWith("test_") ? "sandbox" : "live";
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function supabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (isNewSupabaseApiKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function userClient(token: string): SupabaseClient<Database> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured");
  return createClient<Database>(url, key, {
    global: { fetch: supabaseFetch(key), headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when this user may generate Google API traffic. */
export async function hasMapAccess(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data: isAdmin } = await client.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (isAdmin) return true;

  const { data: sub } = await client
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .eq("environment", paddleEnvironment())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return false;

  const periodOpen =
    !sub.current_period_end || new Date(sub.current_period_end).getTime() > Date.now();
  return periodOpen && ACTIVE_STATUSES.includes(sub.status);
}

async function pairedOwner(code: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("pair_sessions")
    .select("user_id, expires_at")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  const ok = await hasMapAccess(supabaseAdmin as unknown as SupabaseClient<Database>, data.user_id);
  return ok ? data.user_id : null;
}

export const requireMapAccess = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const headers = request?.headers;
    if (!headers) throw new Error("Unauthorized");

    // 1) Paired phone: short-lived code bound to an account with access.
    const pairCode = headers.get("x-pair-code");
    if (pairCode && /^[A-Z0-9]{6,12}$/i.test(pairCode)) {
      const owner = await pairedOwner(pairCode);
      if (owner) {
        return next({
          context: {
            supabase: null as SupabaseClient<Database> | null,
            userId: owner,
            via: "pair" as "pair" | "session",
          },
        });
      }
    }

    // 2) Signed-in member or admin.
    const authHeader = headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token || token.split(".").length !== 3) {
      throw new Error("Unauthorized: sign in to use navigation");
    }

    const supabase = userClient(token);
    const { data, error } = await supabase.auth.getClaims(token);
    const userId = data?.claims?.sub;
    if (error || !userId) throw new Error("Unauthorized: invalid session");

    if (!(await hasMapAccess(supabase, userId))) {
      throw new Error("Your membership is not active.");
    }

    return next({
      context: {
        supabase: supabase as SupabaseClient<Database> | null,
        userId,
        via: "session" as "pair" | "session",
      },
    });
  },
);
