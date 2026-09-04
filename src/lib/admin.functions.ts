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
