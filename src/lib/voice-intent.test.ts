import { describe, expect, it } from "vitest";
import { cleanSpokenDestination } from "@/lib/voice-intent";

describe("cleanSpokenDestination", () => {
  it("drops the leading Georgian command word", () => {
    expect(cleanSpokenDestination("წამიყვანე სითი მოლში")).toBe("სითი მოლი");
  });

  it("keeps a street number and drops 'ნომერში'", () => {
    expect(cleanSpokenDestination("მიმიყვანე ბელიაშვილის 12 ნომერში")).toBe("ბელიაშვილის 12");
  });

  it("handles English commands", () => {
    expect(cleanSpokenDestination("take me to City Mall")).toBe("City Mall");
  });

  it("leaves a plain address untouched", () => {
    expect(cleanSpokenDestination("რუსთაველის 24")).toBe("რუსთაველის 24");
  });

  it("never returns an empty string", () => {
    expect(cleanSpokenDestination("წამიყვანე")).toBe("წამიყვანე");
  });
});
