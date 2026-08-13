import { describe, expect, it } from "vitest";
import { rugTypeSchema } from "./rug-catalog";

const validRugType = {
  name: "Dywany testowe",
  slug: "dywany-testowe",
  description: null,
  leadTimeDays: 14,
  displayOrder: 1,
  isActive: true,
  hasDelay: false,
};

describe("rugTypeSchema orderMode", () => {
  it.each(["quote", "checkout"] as const)(
    "accepts the supported %s order mode",
    (orderMode) => {
      const result = rugTypeSchema.safeParse({ ...validRugType, orderMode });

      expect(result.success).toBe(true);
    },
  );

  it("rejects an unknown order mode", () => {
    const result = rugTypeSchema.safeParse({
      ...validRugType,
      orderMode: "cash_on_delivery",
    });

    expect(result.success).toBe(false);
  });

  it("requires an order mode when a category is saved", () => {
    const result = rugTypeSchema.safeParse(validRugType);

    expect(result.success).toBe(false);
  });
});
