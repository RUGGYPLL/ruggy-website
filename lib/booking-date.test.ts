import { describe, expect, it } from "vitest";
import {
  getBookingLeadDateKeys,
  getMinimumBookingDateKey,
  normalizeBookingLeadDays,
} from "./booking-date";

describe("booking lead days", () => {
  it("uses the configured number of blocked dates", () => {
    expect(getBookingLeadDateKeys("2026-10-14", 3)).toEqual([
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    expect(getMinimumBookingDateKey(new Date("2026-10-14T12:00:00Z"), 3)).toBe(
      "2026-10-17",
    );
  });

  it("falls back to five days for invalid settings", () => {
    expect(normalizeBookingLeadDays(0)).toBe(5);
    expect(normalizeBookingLeadDays(31)).toBe(5);
    expect(normalizeBookingLeadDays("7")).toBe(7);
  });
});
