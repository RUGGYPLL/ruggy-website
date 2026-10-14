import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/server-admin", () => ({
  getAuthorizedAdminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getAuthorizedAdminClient } from "@/lib/auth/server-admin";
import { toggleMaintenanceMode, updateBookingLeadDays } from "./actions";

const getAuthorizedAdminClientMock = vi.mocked(getAuthorizedAdminClient);

describe("toggleMaintenanceMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an authorized administrator", async () => {
    getAuthorizedAdminClientMock.mockResolvedValue(null);

    await expect(toggleMaintenanceMode(true)).resolves.toEqual({
      success: false,
      message: "Sesja administratora wygasła.",
    });
  });

  it("persists the requested state for an authorized administrator", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    getAuthorizedAdminClientMock.mockResolvedValue({ from } as never);

    await expect(toggleMaintenanceMode(true)).resolves.toEqual({
      success: true,
    });
    expect(from).toHaveBeenCalledWith("site_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "global",
        maintenance_mode: true,
      }),
      { onConflict: "id" },
    );
  });

  it("returns a useful error when the setting cannot be saved", async () => {
    const upsert = vi.fn().mockResolvedValue({
      error: new Error("database unavailable"),
    });
    getAuthorizedAdminClientMock.mockResolvedValue({
      from: vi.fn().mockReturnValue({ upsert }),
    } as never);

    await expect(toggleMaintenanceMode(false)).resolves.toEqual({
      success: false,
      message: "Nie udało się zmienić trybu przerwy technicznej.",
    });
  });
});

describe("updateBookingLeadDays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects values outside the supported range", async () => {
    await expect(updateBookingLeadDays(0)).resolves.toEqual({
      success: false,
      message: "Podaj liczbę dni od 1 do 30.",
    });
    expect(getAuthorizedAdminClientMock).not.toHaveBeenCalled();
  });

  it("persists the requested number of days for an authorized administrator", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    getAuthorizedAdminClientMock.mockResolvedValue({ from } as never);

    await expect(updateBookingLeadDays(8)).resolves.toEqual({
      success: true,
      bookingLeadDays: 8,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "global",
        booking_lead_days: 8,
      }),
      { onConflict: "id" },
    );
  });

  it("requires an authorized administrator", async () => {
    getAuthorizedAdminClientMock.mockResolvedValue(null);

    await expect(updateBookingLeadDays(8)).resolves.toEqual({
      success: false,
      message: "Sesja administratora wygasła.",
    });
  });
});
