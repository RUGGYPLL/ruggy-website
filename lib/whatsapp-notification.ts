import "server-only";

import {
  createOutboundRequestSignal,
  formatOutboundRequestError,
  OUTBOUND_REQUEST_TIMEOUT_MS,
} from "@/lib/outbound-request";

export type WhatsAppNotificationResult =
  | { success: true }
  | {
      success: false;
      reason: "not_configured" | "request_failed";
      message: string;
    };

const normalizePhoneNumber = (value: string) => value.replace(/\D/g, "");

const getProviderErrorMessage = (body: string) => {
  if (!body) return null;

  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: number; error_user_msg?: string; message?: string };
    };
    const providerError = parsed.error;
    if (!providerError) return body.slice(0, 500);

    return [
      providerError.code ? `kod ${providerError.code}` : null,
      providerError.error_user_msg || providerError.message || null,
    ]
      .filter(Boolean)
      .join(": ")
      .slice(0, 500);
  } catch {
    return body.slice(0, 500);
  }
};

const sendBookingWhatsAppNotification = async (
  _bookingId: number,
  templateName: string,
): Promise<WhatsAppNotificationResult> => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const recipientNumber = normalizePhoneNumber(
    process.env.WHATSAPP_RECIPIENT_NUMBER ?? "",
  );
  const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
  const templateLanguage =
    process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "pl";

  if (
    !accessToken ||
    !phoneNumberId ||
    !recipientNumber ||
    !graphApiVersion
  ) {
    return {
      success: false,
      reason: "not_configured",
      message: "Brakuje konfiguracji WhatsApp Cloud API.",
    };
  }

  if (!/^v\d+\.\d+$/.test(graphApiVersion)) {
    return {
      success: false,
      reason: "not_configured",
      message: "WHATSAPP_GRAPH_API_VERSION ma nieprawidłowy format.",
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipientNumber,
          type: "template",
          template: {
            name: templateName,
            language: {
              code: templateLanguage,
            },
          },
        }),
        cache: "no-store",
        signal: createOutboundRequestSignal(
          OUTBOUND_REQUEST_TIMEOUT_MS.notification,
        ),
      },
    );

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      const providerError = getProviderErrorMessage(responseBody);
      return {
        success: false,
        reason: "request_failed",
        message: `WhatsApp API zwróciło status ${response.status}.${
          providerError ? ` Szczegóły: ${providerError}` : ""
        }`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      reason: "request_failed",
      message: formatOutboundRequestError("WhatsApp API", error),
    };
  }
};

export function sendQuoteRequestWhatsAppNotification(bookingId: number) {
  return sendBookingWhatsAppNotification(
    bookingId,
    process.env.WHATSAPP_TEMPLATE_NAME?.trim() || "new_quote_request",
  );
}

export function sendAgreedProjectPaymentWhatsAppNotification(bookingId: number) {
  return sendBookingWhatsAppNotification(
    bookingId,
    process.env.WHATSAPP_PAID_TEMPLATE_NAME?.trim() ||
      process.env.WHATSAPP_TEMPLATE_NAME?.trim() ||
      "new_paid_project",
  );
}
