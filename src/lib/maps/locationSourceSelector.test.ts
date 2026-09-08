import { describe, expect, it } from "vitest";
import { LocationSourceSelector } from "./locationSourceSelector";

const tesla = (accuracy: number) => ({ accuracy, source: "geolocation" });
const phone = (accuracy: number) => ({ accuracy, source: "phone" });

describe("LocationSourceSelector", () => {
  it("1. keeps Tesla active when Tesla 5m and phone 10m", () => {
    const s = new LocationSourceSelector();
    let t = 1000;
    expect(s.offer(tesla(5), t)).toBe(true);
    for (let i = 0; i < 5; i++) {
      t += 1000;
      s.offer(phone(10), t);
      t += 1000;
      s.offer(tesla(5), t);
    }
    expect(s.activeSource).toBe("tesla");
  });

  it("2. switches to phone when Tesla is 80m and phone 5m for two fixes", () => {
    const s = new LocationSourceSelector();
    let t = 1000;
    s.offer(tesla(80), t);
    t += 500;
    s.offer(phone(5), t);
    expect(s.activeSource).toBe("tesla");
    t += 500;
    expect(s.offer(phone(5), t)).toBe(true);
    expect(s.activeSource).toBe("phone");
    expect(s.snapshot(t).reason).toBe("phone-significantly-better");
  });

  it("3. hands over immediately when Tesla stops updating for over 8s", () => {
    const s = new LocationSourceSelector();
    s.offer(tesla(5), 1000);
    expect(s.offer(phone(20), 1000 + 9_500)).toBe(true);
    expect(s.snapshot(10_500).reason).toBe("tesla-stale");
  });

  it("4. returns to Tesla after it recovers for two fixes", () => {
    const s = new LocationSourceSelector();
    let t = 1000;
    s.offer(tesla(200), t);
    t += 500;
    s.offer(phone(5), t);
    t += 500;
    s.offer(phone(5), t);
    expect(s.activeSource).toBe("phone");
    t += 1500;
    s.offer(tesla(5), t);
    t += 1000;
    s.offer(tesla(5), t);
    expect(s.activeSource).toBe("tesla");
    expect(s.snapshot(t).reason).toBe("tesla-recovered");
  });

  it("5. a single excellent phone fix does not steal a healthy Tesla", () => {
    const s = new LocationSourceSelector();
    let t = 1000;
    s.offer(tesla(60), t);
    t += 300;
    expect(s.offer(phone(3), t)).toBe(false);
    expect(s.activeSource).toBe("tesla");
  });

  it("6. rapidly alternating accuracy does not flap the source", () => {
    const s = new LocationSourceSelector();
    let t = 1000;
    s.offer(tesla(8), t);
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      t += 400;
      s.offer(phone(i % 2 === 0 ? 4 : 120), t);
      t += 400;
      s.offer(tesla(i % 2 === 0 ? 90 : 6), t);
      seen.add(String(s.activeSource));
    }
    expect([...seen]).toEqual(["tesla"]);
  });

  it("7. device timestamps with different clocks do not affect freshness", () => {
    const s = new LocationSourceSelector();
    // Phone clock is a year ahead; only local received time matters.
    s.offer({ ...phone(5), timestamp: Date.now() + 31e9 } as never, 1000);
    s.offer({ ...tesla(5), timestamp: 0 } as never, 1200);
    expect(s.activeSource).toBe("phone");
    expect(s.snapshot(1200).tesla.stale).toBe(false);
    expect(s.snapshot(1200).phone.stale).toBe(false);
  });

  it("8. HUD mode prefers a fresh phone", () => {
    const s = new LocationSourceSelector();
    s.setHudMode(true);
    s.offer(tesla(4), 1000);
    expect(s.offer(phone(60), 1200)).toBe(true);
    expect(s.activeSource).toBe("phone");
    expect(s.snapshot(1200).reason).toBe("hud-phone");
  });

  it("9. HUD mode falls back to Tesla when the phone goes stale", () => {
    const s = new LocationSourceSelector();
    s.setHudMode(true);
    s.offer(phone(10), 1000);
    expect(s.offer(tesla(10), 1000 + 9_000)).toBe(true);
    expect(s.snapshot(10_000).reason).toBe("hud-phone-stale-fallback");
  });
});
