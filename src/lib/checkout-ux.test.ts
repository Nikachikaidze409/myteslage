import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildOrderPayload, withoutExplicitPaymentMethods } from "./bog.server";
import { displayNameFrom } from "@/components/AccountMenu";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

describe("payment success page", () => {
  const page = src("routes/checkout.success.tsx");

  it("shows the Georgian success title only in the verified state", () => {
    expect(page).toContain("გადახდა წარმატებით შესრულდა");
    expect(page).toContain("გსურთ აპლიკაციის გახსნა თუ მთავარ გვერდზე დაბრუნება?");
    const activeIdx = page.indexOf('state === "active"');
    expect(activeIdx).toBeGreaterThan(-1);
    expect(page.indexOf("გადახდა წარმატებით შესრულდა")).toBeGreaterThan(activeIdx);
  });

  it("offers both an app action and a home action", () => {
    expect(page).toContain("აპლიკაციის გახსნა");
    expect(page).toContain("მთავარ გვერდზე დაბრუნება");
    expect(page).toMatch(/to="\/map"/);
    expect(page).toMatch(/to="\/"/);
  });

  it("never auto-redirects and keeps verification-driven states", () => {
    expect(page).not.toMatch(/navigate\(|window\.location\.replace\(|setTimeout\([^)]*\/map/);
    expect(page).toContain("getBogPaymentState");
    expect(page).toContain('getMembershipState({ data: { provider: "paddle" } })');
    // BOG success stays tied to the exact verified order.
    expect(page).toContain('result.state === "completed"');
  });
});

describe("account menu", () => {
  const menu = src("components/AccountMenu.tsx");

  it("falls back to the email local part when full_name is missing", () => {
    expect(displayNameFrom("Giorgi", "g@x.ge")).toBe("Giorgi");
    expect(displayNameFrom(null, "giorgi@x.ge")).toBe("giorgi");
    expect(displayNameFrom("   ", "nika@x.ge")).toBe("nika");
    expect(displayNameFrom(null, null)).toBe("Account");
  });

  it("reads the name from profiles.full_name", () => {
    expect(menu).toContain('.from("profiles")');
    expect(menu).toContain('.select("full_name")');
  });

  it("signs out through Supabase and returns home", () => {
    expect(menu).toContain("await supabase.auth.signOut()");
    expect(menu).toContain('window.location.assign("/")');
  });

  it("renders nothing when signed out", () => {
    expect(menu).toContain("if (!email) return null;");
  });

  it("is accessible and closes on outside click or Escape", () => {
    expect(menu).toContain("aria-expanded={open}");
    expect(menu).toContain('e.key === "Escape"');
    expect(menu).toContain('document.addEventListener("mousedown", onDown)');
  });
});

describe("BOG hosted checkout payment methods", () => {
  const payload = buildOrderPayload("monthly", "tsn_abc");

  it("keeps Apple Pay on the bank's hosted page", () => {
    expect(payload.config?.apple_pay.external).toBe(false);
    expect(src("lib/bog.server.ts")).not.toContain("external: true");
  });

  it("requests Apple Pay without removing card or other enabled methods", () => {
    expect(payload.payment_method).toEqual([
      "card",
      "apple_pay",
      "google_pay",
      "bog_p2p",
      "bog_loyalty",
    ]);
  });

  it("can fall back to merchant-default methods without breaking checkout", () => {
    const fallback = withoutExplicitPaymentMethods(payload);
    expect(fallback.payment_method).toBeUndefined();
    expect(fallback.config).toBeUndefined();
    expect(fallback.purchase_units.total_amount).toBe(8);
    expect(fallback.redirect_urls).toEqual(payload.redirect_urls);
  });
});
