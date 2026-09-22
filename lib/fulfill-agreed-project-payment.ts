import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { sendAgreedProjectPaymentConfirmationEmail } from "@/lib/order-confirmation-email";
import { sendAgreedProjectPaymentWhatsAppNotification } from "@/lib/whatsapp-notification";

export type AgreedProjectPaymentFulfillmentResult =
  | {
      success: true;
      bookingId: number;
      amountCents: number;
      customerName: string;
      projectReference: string;
    }
  | {
      success: false;
      reason:
        | "invalid_session"
        | "not_paid"
        | "wrong_checkout_kind"
        | "missing_metadata"
        | "database_error";
      message: string;
    };

const getPaymentIntentId = (paymentIntent: unknown) =>
  typeof paymentIntent === "string"
    ? paymentIntent
    : paymentIntent && typeof paymentIntent === "object" && "id" in paymentIntent
      ? String(paymentIntent.id)
      : null;

const readExistingBooking = async (sessionId: string) => {
  const { data, error } = await createAdminClient()
    .from("bookings")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("Nie udało się sprawdzić istniejącej płatności:", error);
    return { error };
  }

  return { bookingId: data?.id == null ? null : Number(data.id) };
};

export async function fulfillAgreedProjectPayment(
  sessionId: string,
): Promise<AgreedProjectPaymentFulfillmentResult> {
  if (!sessionId.startsWith("cs_")) {
    return {
      success: false,
      reason: "invalid_session",
      message: "Nieprawidłowy identyfikator płatności.",
    };
  }

  let session;

  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch (error) {
    console.error("Nie udało się pobrać płatności uzgodnionego projektu:", error);
    return {
      success: false,
      reason: "invalid_session",
      message: "Nie udało się potwierdzić płatności w Stripe.",
    };
  }

  if (session.metadata?.checkoutKind !== "agreed_project_payment") {
    return {
      success: false,
      reason: "wrong_checkout_kind",
      message: "Ta płatność nie dotyczy uzgodnionego projektu.",
    };
  }

  if (session.payment_status !== "paid") {
    return {
      success: false,
      reason: "not_paid",
      message: "Płatność nie została jeszcze potwierdzona.",
    };
  }

  const customerEmail = session.customer_details?.email ?? session.customer_email;
  const customerName = session.metadata.customerName?.trim();
  const projectReference = session.metadata.projectReference?.trim();

  if (
    session.amount_total == null ||
    !customerEmail ||
    !customerName ||
    !projectReference
  ) {
    console.error("Płatność uzgodnionego projektu nie ma kompletnych danych:", {
      sessionId: session.id,
      missing: {
        amount: session.amount_total == null,
        customerEmail: !customerEmail,
        customerName: !customerName,
        projectReference: !projectReference,
      },
    });
    return {
      success: false,
      reason: "missing_metadata",
      message: "Płatność nie zawiera kompletnych danych projektu.",
    };
  }

  const existing = await readExistingBooking(session.id);

  if ("error" in existing) {
    return {
      success: false,
      reason: "database_error",
      message: "Nie udało się sprawdzić zamówienia w Supabase.",
    };
  }

  if (existing.bookingId != null) {
    return {
      success: true,
      bookingId: existing.bookingId,
      amountCents: session.amount_total,
      customerName,
      projectReference,
    };
  }

  const supabase = createAdminClient();
  const { data: savedBooking, error } = await supabase
    .from("bookings")
    .insert({
      payment_kind: "agreed_project_payment",
      rug_type_id: null,
      rug_variant_id: null,
      rug_size_id: null,
      rug_type_name: "Uzgodniony projekt",
      rug_variant_name: null,
      rug_size_label: null,
      project_reference: projectReference,
      price_cents: session.amount_total,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: null,
      notes: null,
      booking_date: null,
      status: "paid",
      stripe_session_id: session.id,
      stripe_payment_intent_id: getPaymentIntentId(session.payment_intent),
      expires_at: new Date(session.expires_at * 1000).toISOString(),
      delivery_method: null,
      parcel_locker_code: null,
      delivery_address: null,
      reference_image_path: null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !savedBooking) {
    if (error?.code === "23505") {
      const concurrent = await readExistingBooking(session.id);
      if ("bookingId" in concurrent && concurrent.bookingId != null) {
        return {
          success: true,
          bookingId: concurrent.bookingId,
          amountCents: session.amount_total,
          customerName,
          projectReference,
        };
      }
    }

    console.error(
      "Nie udało się zapisać płatności uzgodnionego projektu:",
      JSON.stringify({
        code: error?.code,
        message: error?.message,
        hint: error?.hint,
      }),
    );
    return {
      success: false,
      reason: "database_error",
      message: "Nie udało się zapisać opłaconego projektu.",
    };
  }

  const bookingId = Number(savedBooking.id);
  const emailResult = await sendAgreedProjectPaymentConfirmationEmail({
    bookingId,
    stripeSessionId: session.id,
    customerName,
    customerEmail,
    projectReference,
    amountCents: session.amount_total,
  });

  if (!emailResult.success) {
    console.error(
      "Nie udało się wysłać potwierdzenia płatności:",
      JSON.stringify(emailResult),
    );
  }

  const whatsappResult =
    await sendAgreedProjectPaymentWhatsAppNotification(bookingId);

  if (!whatsappResult.success) {
    console.error(
      "Nie udało się wysłać powiadomienia WhatsApp o płatności:",
      JSON.stringify(whatsappResult),
    );
  }

  const { error: notificationTrackingError } = await supabase
    .from("bookings")
    .update({
      whatsapp_notification_status: whatsappResult.success ? "sent" : "failed",
      whatsapp_notification_error: whatsappResult.success
        ? null
        : whatsappResult.message,
      whatsapp_notification_sent_at: whatsappResult.success
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (notificationTrackingError) {
    console.error(
      "Nie udało się zapisać statusu WhatsApp płatności:",
      JSON.stringify({
        code: notificationTrackingError.code,
        message: notificationTrackingError.message,
      }),
    );
  }

  return {
    success: true,
    bookingId,
    amountCents: session.amount_total,
    customerName,
    projectReference,
  };
}
