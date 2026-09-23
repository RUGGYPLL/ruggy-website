import { describe, expect, it } from "vitest";
import {
  calculateCustomRugPriceCents,
  calculateCustomRugPriceRangeCents,
} from "./custom-rug-price";

describe("calculateCustomRugPriceCents", () => {
  it("keeps the current height based price when width is missing", () => {
    expect(calculateCustomRugPriceCents(70)).toBe(55000);
  });

  it("uses the rug area when width is provided", () => {
    expect(calculateCustomRugPriceCents(70, 100)).toBe(55000);
    expect(calculateCustomRugPriceCents(70, 200)).toBe(84000);
  });

  it("rejects dimensions outside the allowed range", () => {
    expect(calculateCustomRugPriceCents(70, 19)).toBeNull();
    expect(calculateCustomRugPriceCents(301, 100)).toBeNull();
  });
});

describe("calculateCustomRugPriceRangeCents", () => {
  it("returns the rounded twenty percent quote range", () => {
    expect(calculateCustomRugPriceRangeCents(55000)).toEqual({
      fromCents: 44000,
      toCents: 66000,
    });
  });
});
