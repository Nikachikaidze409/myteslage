import { createContext, useContext, type ReactNode } from "react";
import { marketFromHost, type Market } from "@/lib/market";

const MarketContext = createContext<Market>("ge");

export function MarketProvider({ market, children }: { market: Market; children: ReactNode }) {
  return <MarketContext.Provider value={market}>{children}</MarketContext.Provider>;
}

/**
 * The market resolved on the server for this request. The hostname fallback
 * only matters for components rendered outside the provider.
 */
export function useMarket(): Market {
  const fromContext = useContext(MarketContext);
  if (fromContext === "am") return "am";
  if (typeof window !== "undefined") return marketFromHost(window.location.hostname);
  return fromContext;
}
