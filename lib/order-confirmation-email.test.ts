import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  sendAgreedProjectPaymentConfirmationEmail,
  sendQuoteRequestConfirmationEmail,
} from "./order-confirmation-email";

const fetchMock = vi.fn();

describe("agreed project payment email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Ruggy <zamowienia@example.com>";
    delete process.env.RESEND_TEST_RECIPIENT;
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "email_123" }),
    });
  });

  it("sends the payment confirmation to the customer with an idempotency key", async () => {
    await expect(
      sendAgreedProjectPaymentConfirmationEmail({
        bookingId: 91,
        stripeSessionId: "cs_agreed_123",
        customerName: "Jan Kowalski",
        customerEmail: "klient@example.com",
        projectReference: "Dywan z logo",
        amountCents: 22500,
      }),
    ).resolves.toEqual({
      success: true,
      emailId: "email_123",
      recipient: "klient@example.com",
      testMode: false,
    });

    const request = fetchMock.mock.calls[0];
    const payload = JSON.parse(request[1].body as string);

    expect(payload.to).toEqual(["klient@example.com"]);
    expect(payload.subject).toContain("#91");
    expect(payload.text).toContain("225");
    expect(payload.text).toContain("zł");
    expect(payload.text).toContain("Dywan z logo");
    expect(request[1].headers["Idempotency-Key"]).toBe(
      "agreed-project-payment/cs_agreed_123/customer",
    );
  });

  it("reports a Resend failure without hiding the provider status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422 });

    await expect(
      sendAgreedProjectPaymentConfirmationEmail({
        bookingId: 91,
        stripeSessionId: "cs_agreed_123",
        customerName: "Jan Kowalski",
        customerEmail: "klient@example.com",
        projectReference: "Dywan z logo",
        amountCents: 22500,
      }),
    ).resolves.toEqual({
      success: false,
      reason: "request_failed",
      message: "Resend API zwróciło status 422.",
    });
  });
});

describe("quote request confirmation email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Ruggy <zamowienia@example.com>";
    delete process.env.RESEND_TEST_RECIPIENT;
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "email_quote_123" }),
    });
  });

  it("sends quote details to the customer with an idempotency key", async () => {
    await expect(
      sendQuoteRequestConfirmationEmail({
        bookingId: 84,
        customerName: "Jan Kowalski",
        customerEmail: "klient@example.com",
        rugTypeName: "Custom",
        rugVariantName: "Logo",
        rugSizeLabel: "120 × 80 cm",
        estimatedAmountCents: 43700,
        bookingDate: "2026-09-25",
        deliveryMethod: "courier",
        parcelLockerCode: null,
        deliveryAddress: "ul. Testowa 1, 00-001 Warszawa",
      }),
    ).resolves.toEqual({
      success: true,
      emailId: "email_quote_123",
      recipient: "klient@example.com",
      testMode: false,
    });

    const request = fetchMock.mock.calls[0];
    const payload = JSON.parse(request[1].body as string);

    expect(payload.to).toEqual(["klient@example.com"]);
    expect(payload.subject).toContain("#84");
    expect(payload.text).toContain("do wyceny");
    expect(payload.text).toContain("437");
    expect(request[1].headers["Idempotency-Key"]).toBe(
      "quote-request/84",
    );
  });
});
