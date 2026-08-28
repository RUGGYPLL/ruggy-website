import { describe, expect, it } from "vitest";
import {
  MAINTENANCE_PATH,
  shouldRedirectToMaintenance,
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

  it("shows the public site to an administrator during maintenance", () => {
    expect(shouldRedirectToMaintenance("/", true, true)).toBe(false);
    expect(shouldRedirectToMaintenance("/zamow", true, true)).toBe(false);
  });

  it("redirects anonymous visitors only when maintenance is enabled", () => {
    expect(shouldRedirectToMaintenance("/", true, false)).toBe(true);
    expect(shouldRedirectToMaintenance("/", false, false)).toBe(false);
  });

  it("keeps admin and server routes available during maintenance", () => {
    expect(shouldRedirectToMaintenance("/admin/dashboard", true, false)).toBe(
      false,
    );
    expect(shouldRedirectToMaintenance("/api/health", true, false)).toBe(
      false,
    );
  });
});
