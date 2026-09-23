import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hasMapAccess } from "@/lib/map-access.middleware";

export type PairCheck =
  | { ok: true; userId: string; expiresAt: string }
  | { ok: false; reason: "unknown" | "expired" | "membership_inactive" };

/**
 * Same rule as the paired-phone branch of requireMapAccess: the code must
 * exist, be unexpired, and belong to an account that has map access.
 */
export async function checkPairCode(code: string): Promise<PairCheck> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("pair_sessions")
    .select("user_id, expires_at")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (!data) return { ok: false, reason: "unknown" };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { ok: false, reason: "expired" };
  const access = await hasMapAccess(
    supabaseAdmin as unknown as SupabaseClient<Database>,
    data.user_id,
  );
  if (!access) return { ok: false, reason: "membership_inactive" };
  return { ok: true, userId: data.user_id, expiresAt: data.expires_at };
}
