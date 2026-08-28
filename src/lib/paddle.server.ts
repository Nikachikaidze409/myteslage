export type PaddleEnv = "sandbox" | "live";

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/paddle";

function connectionKey(env: PaddleEnv): string {
  const key =
    env === "live" ? process.env["PADDLE_LIVE_API_KEY"] : process.env["PADDLE_SANDBOX_API_KEY"];
  if (!key) throw new Error(`Missing Paddle API key for environment ${env}`);
  return key;
}

export async function gatewayFetch(
  env: PaddleEnv,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${lovableKey}`);
  headers.set("X-Connection-Api-Key", connectionKey(env));
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(`${GATEWAY_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
}

/** Resolves a Paddle internal id (pri_… / pro_…) to its human readable external id. */
export async function resolveExternalId(
  env: PaddleEnv,
  resource: "prices" | "products",
  paddleId: string,
): Promise<string | null> {
  const res = await gatewayFetch(env, `/${resource}/${paddleId}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { import_meta?: { external_id?: string } } };
  return json.data?.import_meta?.external_id ?? null;
}
