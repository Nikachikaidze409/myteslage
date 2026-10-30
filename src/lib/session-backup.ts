// Keeps a copy of the sign-in refresh token in a long-lived first-party
// cookie. The Tesla browser (and some phones) wipe localStorage after deep
// sleep, which used to sign drivers out. When that happens we silently
// restore the session from this cookie instead of asking for the password.
import { supabase } from "@/integrations/supabase/client";

const COOKIE = "tsl_rt";
const MAX_AGE = 60 * 60 * 24 * 365;
let installed = false;

function write(token: string | null) {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = token
    ? `${COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${MAX_AGE}; SameSite=Lax${secure}`
    : `${COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
}

function read(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)tsl_rt=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Mirror every new refresh token to the cookie; clear it only on explicit sign-out. */
export function installSessionBackup() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  supabase.auth.getSession().then(({ data }) => {
    if (data.session?.refresh_token) write(data.session.refresh_token);
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.refresh_token) write(session.refresh_token);
    else if (event === "SIGNED_OUT") write(null);
  });
}

/** Try to rebuild a lost session from the cookie. */
export async function restoreSessionFromBackup() {
  const token = read();
  if (!token) return null;
  try {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: token });
    if (error) {
      // Only drop the backup when the server explicitly rejected it.
      if (navigator.onLine && /invalid|not found|revoked|expired/i.test(error.message)) write(null);
      return null;
    }
    return data.session;
  } catch {
    return null;
  }
}

export function hasSessionBackup() {
  return !!read();
}
