import { createServerFn } from "@tanstack/react-start";
import { marketFromHost, type Market } from "@/lib/market";

/** The market is decided by the request host, never by the browser. */
export const getMarket = createServerFn({ method: "GET" }).handler(async (): Promise<Market> => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;
  return marketFromHost(host);
});
