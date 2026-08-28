import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { gatewayFetch } from "@/lib/paddle.server";

export const resolvePaddlePrice = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ priceId: z.string().min(1), environment: z.enum(["sandbox", "live"]) }).parse(data))
  .handler(async ({ data }) => {
    const response = await gatewayFetch(data.environment, `/prices?external_id=${encodeURIComponent(data.priceId)}`);
    if (!response.ok) throw new Error("Unable to resolve payment price");
    const result = (await response.json()) as { data?: Array<{ id: string }> };
    const paddlePriceId = result.data?.[0]?.id;
    if (!paddlePriceId) throw new Error("Payment price not found");
    return paddlePriceId;
  });
