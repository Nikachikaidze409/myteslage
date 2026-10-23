// Unique per-browser device id, kept in localStorage and mirrored to a
// long-lived cookie so a Tesla browser that wipes localStorage keeps its id.
const KEY = "tsl.device-id.v1";

function readCookie(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)tsl_dev=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(KEY);
  } catch {
    /* ignore */
  }
  if (!id) id = readCookie();
  if (!id) id = `d_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  document.cookie = `tsl_dev=${encodeURIComponent(id)}; path=/; max-age=31536000; SameSite=Lax`;
  return id;
}

export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "device";
  const ua = navigator.userAgent;
  if (/Tesla/i.test(ua)) return "Tesla browser";
  if (/iPhone|iPad/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return ua.slice(0, 60);
}
