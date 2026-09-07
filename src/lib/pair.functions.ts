import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function secureCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * Starts a pairing session for the signed-in car owner.
 * Any previous code for this account stops working immediately, and the new
 * one expires on its own after 12 hours.
 */
export const createPairSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("pair_sessions").delete().eq("user_id", context.userId);

    const code = secureCode();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { error } = await context.supabase
      .from("pair_sessions")
      .insert({ code, user_id: context.userId, expires_at: expiresAt });
    if (error) throw new Error("Could not start pairing. Please try again.");

    return { code, expiresAt };
  });

/** Ends pairing: the phone loses access right away. */
export const endPairSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("pair_sessions").delete().eq("user_id", context.userId);
    return { ok: true as const };
  });
