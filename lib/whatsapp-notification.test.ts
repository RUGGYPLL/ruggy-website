import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  sendAgreedProjectPaymentWhatsAppNotification,
  sendQuoteRequestWhatsAppNotification,
} from "./whatsapp-notification";

const fetchMock = vi.fn();

describe("WhatsApp booking notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id";
    process.env.WHATSAPP_RECIPIENT_NUMBER = "+48 720 000 000";
    process.env.WHATSAPP_GRAPH_API_VERSION = "v26.0";
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = "pl";
    process.env.WHATSAPP_TEMPLATE_NAME = "nowa_sprzedaz";
    delete process.env.WHATSAPP_PAID_TEMPLATE_NAME;
    fetchMock.mockResolvedValue({ ok: true });
  });

  it("uses the dedicated paid project template when it is configured", async () => {
    process.env.WHATSAPP_PAID_TEMPLATE_NAME = "oplacony_projekt";

    await expect(
      sendAgreedProjectPaymentWhatsAppNotification(91),
    ).resolves.toEqual({ success: true });

    const request = fetchMock.mock.calls[0];
    const payload = JSON.parse(request[1].body as string);

    expect(request[0]).toBe(
      "https://graph.facebook.com/v26.0/phone-id/messages",
    );
    expect(payload.template.name).toBe("oplacony_projekt");
    expect(payload.template.language.code).toBe("pl");
    expect(payload.template.components[0].parameters[0].text).toContain(
      "/admin/dashboard?booking=91",
    );
  });

  it("keeps the existing quote template for quote notifications", async () => {
    await expect(sendQuoteRequestWhatsAppNotification(42)).resolves.toEqual({
      success: true,
    });

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.template.name).toBe("nowa_sprzedaz");
    expect(payload.template.components[0].parameters[0].text).toContain(
      "/admin/dashboard?booking=42",
    );
  });

  it("reports missing WhatsApp configuration without making a request", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;

    await expect(
      sendAgreedProjectPaymentWhatsAppNotification(91),
    ).resolves.toEqual({
      success: false,
      reason: "not_configured",
      message: "Brakuje konfiguracji WhatsApp Cloud API.",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes the provider error body when Meta rejects the message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 132000,
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          error: { code: 132000, message: "Template does not exist" },
        }),
      ),
    });

    await expect(sendQuoteRequestWhatsAppNotification(42)).resolves.toEqual({
      success: false,
      reason: "request_failed",
      message:
        "WhatsApp API zwróciło status 132000. Szczegóły: kod 132000: Template does not exist",
    });
  });
});
