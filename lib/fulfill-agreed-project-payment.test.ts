import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/order-confirmation-email", () => ({
  sendAgreedProjectPaymentConfirmationEmail: vi.fn(),
  sendOwnerBookingNotificationEmail: vi.fn(),
}));

vi.mock("@/lib/whatsapp-notification", () => ({
  sendAgreedProjectPaymentWhatsAppNotification: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import {
  sendAgreedProjectPaymentConfirmationEmail,
  sendOwnerBookingNotificationEmail,
} from "@/lib/order-confirmation-email";
import { sendAgreedProjectPaymentWhatsAppNotification } from "@/lib/whatsapp-notification";
import { fulfillAgreedProjectPayment } from "./fulfill-agreed-project-payment";

const getStripeMock = vi.mocked(getStripe);
const createAdminClientMock = vi.mocked(createAdminClient);
const sendEmailMock = vi.mocked(sendAgreedProjectPaymentConfirmationEmail);
const sendOwnerEmailMock = vi.mocked(sendOwnerBookingNotificationEmail);
const sendWhatsAppMock = vi.mocked(
  sendAgreedProjectPaymentWhatsAppNotification,
);

const paidSession = {
  id: "cs_agreed_123",
  payment_status: "paid",
  amount_total: 22500,
  expires_at: 1_800_000_000,
  payment_intent: "pi_123",
  customer_email: "klient@example.com",
  customer_details: { email: "klient@example.com" },
  metadata: {
    checkoutKind: "agreed_project_payment",
    customerName: "Jan Kowalski",
    projectReference: "Dywan z logo ustalony na Instagramie",
  },
};

const createDatabaseMock = ({ existingBookingId }: { existingBookingId?: number } = {}) => {
  const existingQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  existingQuery.select.mockReturnValue(existingQuery);
  existingQuery.eq.mockReturnValue(existingQuery);
  existingQuery.maybeSingle.mockResolvedValue({
    data: existingBookingId == null ? null : { id: existingBookingId },
    error: null,
  });

  const insertQuery = {
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
  };
  insertQuery.insert.mockReturnValue(insertQuery);
  insertQuery.select.mockReturnValue(insertQuery);
  insertQuery.single.mockResolvedValue({ data: { id: 91 }, error: null });
  insertQuery.update.mockReturnValue(insertQuery);
  insertQuery.eq.mockReturnValue(insertQuery);

  const from = vi
    .fn()
    .mockReturnValueOnce(existingQuery)
    .mockReturnValueOnce(insertQuery)
    .mockReturnValue(insertQuery);
  createAdminClientMock.mockReturnValue({ from } as never);

  return { existingQuery, insertQuery, from };
};

describe("fulfillAgreedProjectPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStripeMock.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue(paidSession),
        },
      },
    } as never);
    sendEmailMock.mockResolvedValue({
      success: true,
      emailId: "email_123",
      recipient: "klient@example.com",
      testMode: false,
    });
    sendOwnerEmailMock.mockResolvedValue({
      success: true,
      emailId: "owner_email_123",
      recipient: "sklep@ruggy.pl",
      testMode: false,
    });
    sendWhatsAppMock.mockResolvedValue({ success: true });
  });

  it("saves a paid agreed project and sends both confirmations", async () => {
    const { insertQuery } = createDatabaseMock();

    await expect(fulfillAgreedProjectPayment(paidSession.id)).resolves.toEqual({
      success: true,
      bookingId: 91,
      amountCents: 22500,
      customerName: "Jan Kowalski",
      projectReference: "Dywan z logo ustalony na Instagramie",
    });

    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_kind: "agreed_project_payment",
        rug_type_id: null,
        project_reference: "Dywan z logo ustalony na Instagramie",
        price_cents: 22500,
        status: "paid",
        stripe_session_id: paidSession.id,
      }),
    );
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 91, amountCents: 22500 }),
    );
    expect(sendOwnerEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 91,
        orderKind: "agreed_project_payment",
        projectReference: "Dywan z logo ustalony na Instagramie",
      }),
    );
    expect(sendWhatsAppMock).toHaveBeenCalledWith(91);
  });

  it("does not create duplicate notifications when Stripe retries the event", async () => {
    createDatabaseMock({ existingBookingId: 91 });

    await expect(fulfillAgreedProjectPayment(paidSession.id)).resolves.toEqual(
      expect.objectContaining({ success: true, bookingId: 91 }),
    );

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendOwnerEmailMock).not.toHaveBeenCalled();
    expect(sendWhatsAppMock).not.toHaveBeenCalled();
  });

  it("does not touch the database before an unpaid session is confirmed", async () => {
    getStripeMock.mockReturnValue({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            ...paidSession,
            payment_status: "unpaid",
          }),
        },
      },
    } as never);

    await expect(fulfillAgreedProjectPayment(paidSession.id)).resolves.toEqual({
      success: false,
      reason: "not_paid",
      message: "Płatność nie została jeszcze potwierdzona.",
    });

    expect(createAdminClientMock).not.toHaveBeenCalled();
  });
});
