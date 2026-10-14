import { describe, expect, it } from "vitest";
import { billingTimeFor } from "./bog.server";

describe("billingTimeFor", () => {
  it("charges at 10:00 Tbilisi on the expiry day when expiry is in the evening", () => {
    // 20:46 Tbilisi = 16:46 UTC
    expect(billingTimeFor(new Date("2026-10-17T16:46:00Z")).toISOString()).toBe(
      "2026-10-17T06:00:00.000Z",
    );
  });
  it("uses the previous day when expiry is before 10:00 Tbilisi", () => {
    // 09:00 Tbilisi = 05:00 UTC
    expect(billingTimeFor(new Date("2026-10-17T05:00:00Z")).toISOString()).toBe(
      "2026-10-16T06:00:00.000Z",
    );
  });
});
