import { describe, expect, it } from "vitest";
import { errorResponseFor, isPairCode } from "@/lib/mobile-api";
import { rateLimitMessage } from "@/lib/route-guard";

describe("mobile API error mapping", () => {
  it("turns the route cost guard into 429 with the wait time", () => {
    const r = errorResponseFor(new Error(rateLimitMessage(4200)));
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: "rate_limited", message: "Route service is busy.", retryAfterMs: 4200 });
  });

  it("reports zod validation errors as bad_request", () => {
    const e = new Error("[{...}]");
    e.name = "ZodError";
    expect(errorResponseFor(e)).toEqual({ status: 400, body: { error: "bad_request", message: "Invalid input" } });
  });

  it("passes other messages through, capped in length", () => {
    const r = errorResponseFor(new Error("No route found"));
    expect(r).toEqual({ status: 400, body: { error: "failed", message: "No route found" } });
    expect(errorResponseFor(new Error("x".repeat(2000))).body.message.length).toBe(500);
    expect(errorResponseFor("boom").body.message).toBe("boom");
  });
});

describe("pairing code header", () => {
  it("accepts the codes the server issues", () => {
    expect(isPairCode("K7P2QX")).toBe(true);
    expect(isPairCode("k7p2qx")).toBe(true);
  });
  it("rejects missing or malformed codes", () => {
    expect(isPairCode(null)).toBe(false);
    expect(isPairCode("ABC")).toBe(false);
    expect(isPairCode("ABC 123")).toBe(false);
    expect(isPairCode("ABCDEFGHIJKLM")).toBe(false);
  });
});
