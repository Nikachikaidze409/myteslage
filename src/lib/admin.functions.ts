import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface RegistrationRow {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  createdAt: string | null;
  status: string | null;
  plan: string;
  expiresAt: string | null;
}

function planLabel(priceId: string | null): string {
  if (!priceId) return "None";
  if (priceId.includes("monthly")) return "Monthly";
  if (priceId.includes("quarterly")) return "3 months";
  return priceId;
}

/**
 * Admin-only: returns every registered profile joined to its latest
 * subscription row. The caller must be signed in AND hold the admin role;
 * the role is re-checked server-side so the endpoint cannot be reached by a
 * non-admin who bypasses the UI.
 */
export const listRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Verify the caller is an admin using the callable security-definer fn.
    const { data: isAdmin, error: roleErr } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleErr) throw new Error("Could not verify admin role.");
    if (!isAdmin) throw new Error("Forbidden");

    // Privileged read: profiles + subscriptions for ALL users. RLS would
    // hide everyone else, so this must run with the service role.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, phone, created_at")
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const { data: subs, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, status, environment, current_period_end, price_id, created_at")
      .order("created_at", { ascending: false });
    if (sErr) throw new Error(sErr.message);

    // Latest subscription per user (most recent row first).
    const latestByUser = new Map<string, { status: string; price_id: string | null; current_period_end: string | null }>();
    for (const s of subs ?? []) {
      if (!latestByUser.has(s.user_id)) {
        latestByUser.set(s.user_id, {
          status: s.status,
          price_id: s.price_id,
          current_period_end: s.current_period_end,
        });
      }
    }

    const rows: RegistrationRow[] = (profiles ?? []).map((p) => {
      const sub = latestByUser.get(p.id);
      return {
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        phone: p.phone,
        createdAt: p.created_at,
        status: sub?.status ?? null,
        plan: planLabel(sub?.price_id ?? null),
        expiresAt: sub?.current_period_end ?? null,
      };
    });

    return rows;
  });

/* ------------------------------------------------------------------ *
 * Bank of Georgia subscription overview (admin only).
 * Never exposes credentials, tokens, or card data.
 * ------------------------------------------------------------------ */

export interface BogMemberRow {
  userId: string;
  email: string | null;
  fullName: string | null;
  plan: string;
  status: string;
  validUntil: string | null;
  autoRenew: boolean;
  nextBillingAt: string | null;
  renewalStatus: string | null;
  renewalAttempts: number;
  cancelAtPeriodEnd: boolean;
  hasParentOrder: boolean;
}

export interface BogRenewalOrderRow {
  id: string;
  userId: string;
  email: string | null;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  attemptNo: number;
  billingPeriodEnd: string | null;
  createdAt: string;
}

export interface BogOverview {
  counts: {
    activeMemberships: number;
    autoRenewOn: number;
    autoRenewOff: number;
    pastDue: number;
    failed: number;
    canceled: number;
    dueNext7Days: number;
  };
  members: BogMemberRow[];
  recentRenewalOrders: BogRenewalOrderRow[];
}

export const bogSubscriptionOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BogOverview> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error("Could not verify admin role.");
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: subs, error: sErr } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "user_id, status, price_id, product_id, current_period_end, auto_renew, next_billing_at, renewal_status, renewal_attempts, cancel_at_period_end, provider_parent_order_id",
      )
      .eq("provider", "bog")
      .order("current_period_end", { ascending: true });
    if (sErr) throw new Error(sErr.message);

    const { data: orders, error: oErr } = await supabaseAdmin
      .from("payment_orders")
      .select("id, user_id, plan, amount, currency, status, attempt_no, billing_period_end, created_at")
      .eq("provider", "bog")
      .eq("kind", "renewal")
      .order("created_at", { ascending: false })
      .limit(25);
    if (oErr) throw new Error(oErr.message);

    const ids = new Set<string>();
    for (const s of subs ?? []) ids.add(s.user_id);
    for (const o of orders ?? []) ids.add(o.user_id);

    const emails = new Map<string, { email: string | null; full_name: string | null }>();
    if (ids.size) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", [...ids]);
      for (const p of profiles ?? []) emails.set(p.id, { email: p.email, full_name: p.full_name });
    }

    const now = Date.now();
    const in7 = now + 7 * 24 * 60 * 60 * 1000;
    const counts = {
      activeMemberships: 0,
      autoRenewOn: 0,
      autoRenewOff: 0,
      pastDue: 0,
      failed: 0,
      canceled: 0,
      dueNext7Days: 0,
    };

    const members: BogMemberRow[] = (subs ?? []).map((s) => {
      const profile = emails.get(s.user_id);
      const open =
        s.status === "active" &&
        (!s.current_period_end || new Date(s.current_period_end).getTime() > now);
      if (open) {
        counts.activeMemberships += 1;
        if (s.auto_renew) counts.autoRenewOn += 1;
        else counts.autoRenewOff += 1;
      }
      if (s.renewal_status === "past_due") counts.pastDue += 1;
      if (s.renewal_status === "failed") counts.failed += 1;
      if (s.status === "canceled" || s.cancel_at_period_end) counts.canceled += 1;
      const due = s.next_billing_at ? new Date(s.next_billing_at).getTime() : null;
      if (s.auto_renew && due !== null && due <= in7) counts.dueNext7Days += 1;

      return {
        userId: s.user_id,
        email: profile?.email ?? null,
        fullName: profile?.full_name ?? null,
        plan: planLabel(s.product_id ?? s.price_id),
        status: s.status,
        validUntil: s.current_period_end,
        autoRenew: !!s.auto_renew,
        nextBillingAt: s.next_billing_at,
        renewalStatus: s.renewal_status,
        renewalAttempts: s.renewal_attempts ?? 0,
        cancelAtPeriodEnd: !!s.cancel_at_period_end,
        hasParentOrder: !!s.provider_parent_order_id,
      };
    });

    const recentRenewalOrders: BogRenewalOrderRow[] = (orders ?? []).map((o) => ({
      id: o.id,
      userId: o.user_id,
      email: emails.get(o.user_id)?.email ?? null,
      plan: o.plan,
      amount: Number(o.amount),
      currency: o.currency,
      status: o.status,
      attemptNo: o.attempt_no ?? 0,
      billingPeriodEnd: o.billing_period_end,
      createdAt: o.created_at,
    }));

    return { counts, members, recentRenewalOrders };
  });
