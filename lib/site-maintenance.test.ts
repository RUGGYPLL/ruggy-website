import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_PATH,
  shouldBypassMaintenance,
} from "./site-maintenance";

describe("site maintenance routes", () => {
  it("keeps the maintenance page reachable", () => {
    expect(shouldBypassMaintenance(MAINTENANCE_PATH)).toBe(true);
  });

  it("keeps the admin panel reachable during maintenance", () => {
    expect(shouldBypassMaintenance("/admin/dashboard")).toBe(true);
    expect(shouldBypassMaintenance("/admin/login")).toBe(true);
  });

  it("keeps server APIs reachable during maintenance", () => {
    expect(shouldBypassMaintenance("/api/stripe/webhook")).toBe(true);
  });

  it("redirects public pages during maintenance", () => {
    expect(shouldBypassMaintenance("/")).toBe(false);
    expect(shouldBypassMaintenance("/realizacje")).toBe(false);
    expect(shouldBypassMaintenance("/zamow")).toBe(false);
  });
});
