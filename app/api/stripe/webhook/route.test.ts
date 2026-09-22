import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "stripe-signature": "sig" })),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { "content-type": "application/json" },
      }),
  },
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/fulfill-checkout", () => ({
  fulfillCheckout: vi.fn(),
}));

vi.mock("@/lib/fulfill-agreed-project-payment", () => ({
  fulfillAgreedProjectPayment: vi.fn(),
}));

import { fulfillAgreedProjectPayment } from "@/lib/fulfill-agreed-project-payment";
import { getStripe } from "@/lib/stripe";
import { POST } from "./route";

const getStripeMock = vi.mocked(getStripe);
const fulfillAgreedProjectPaymentMock = vi.mocked(fulfillAgreedProjectPayment);

describe("Stripe webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    getStripeMock.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn().mockReturnValue({
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_agreed_123",
              metadata: { checkoutKind: "agreed_project_payment" },
            },
          },
        }),
      },
    } as never);
    fulfillAgreedProjectPaymentMock.mockResolvedValue({
      success: true,
      bookingId: 91,
      amountCents: 22500,
      customerName: "Jan Kowalski",
      projectReference: "Uzgodniony projekt",
    });
  });

  it("fulfills an agreed project payment instead of acknowledging it silently", async () => {
    const response = await POST(new Request("https://ruggy.pl/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(200);
    expect(fulfillAgreedProjectPaymentMock).toHaveBeenCalledWith("cs_agreed_123");
    await expect(response.json()).resolves.toEqual({ received: true });
  });

  it("asks Stripe to retry when agreed payment fulfillment fails", async () => {
    fulfillAgreedProjectPaymentMock.mockResolvedValue({
      success: false,
      reason: "database_error",
      message: "Nie udało się zapisać opłaconego projektu.",
    });

    const response = await POST(new Request("https://ruggy.pl/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Nie udało się zapisać opłaconego projektu.",
    });
  });
});
