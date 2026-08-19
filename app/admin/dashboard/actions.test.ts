import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}), { virtual: true });

vi.mock("@/lib/auth/server-admin", () => ({
  getAuthorizedAdminClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getAuthorizedAdminClient } from "@/lib/auth/server-admin";
import { toggleMaintenanceMode } from "./actions";

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
