import { describe, expect, it } from "vitest";
import {
  hasActiveRugVariants,
  normalizeRugOrderMode,
  usesDirectCheckout,
} from "./rug-order-mode";

describe("rug order mode", () => {
  it("uses checkout only for the stored checkout mode", () => {
    expect(usesDirectCheckout("checkout")).toBe(true);
    expect(usesDirectCheckout("quote")).toBe(false);
  });

  it("fails closed to a quote for missing or unknown values", () => {
    expect(normalizeRugOrderMode(null)).toBe("quote");
    expect(normalizeRugOrderMode("unknown")).toBe("quote");
  });
});

describe("hasActiveRugVariants", () => {
  it("returns true for an active variant in any rug category", () => {
    expect(hasActiveRugVariants([{ is_active: true }])).toBe(true);
  });

  it("returns false when a category has no active variants", () => {
    expect(hasActiveRugVariants([{ is_active: false }])).toBe(false);
    expect(hasActiveRugVariants([])).toBe(false);
    expect(hasActiveRugVariants(null)).toBe(false);
  });
});
