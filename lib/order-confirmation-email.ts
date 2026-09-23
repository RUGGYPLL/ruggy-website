import "server-only";

import { formatPriceCents } from "@/lib/custom-rug-price";
import { DELIVERY_LABEL } from "@/lib/delivery-pricing";
import {
  createOutboundRequestSignal,
  formatOutboundRequestError,
  OUTBOUND_REQUEST_TIMEOUT_MS,
} from "@/lib/outbound-request";
import { absoluteUrl, siteConfig } from "@/lib/site-config";

export type OrderConfirmationEmailInput = {
  bookingId: number;
  stripeSessionId: string;
  customerName: string;
  customerEmail: string;
  rugTypeName: string;
  rugVariantName: string | null;
  rugSizeLabel: string;
  amountCents: number;
  bookingDate: string;
  deliveryMethod: string | null;
  parcelLockerCode: string | null;
  deliveryAddress: string | null;
};

export type OrderConfirmationEmailResult =
  | {
      success: true;
      emailId: string | null;
      recipient: string;
      testMode: boolean;
    }
  | {
      success: false;
      reason: "not_configured" | "request_failed";
      message: string;
    };

type DeliveryEmailInput = {
  deliveryMethod: string | null;
  parcelLockerCode: string | null;
  deliveryAddress: string | null;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatBookingDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(date);
};

const getDeliveryLabel = (deliveryMethod: string | null) => {
  if (
    deliveryMethod === "parcel_locker" ||
    deliveryMethod === "courier"
  ) {
    return DELIVERY_LABEL[deliveryMethod];
  }

  return "Do ustalenia";
};

const getDeliveryDetails = (input: DeliveryEmailInput) => {
  if (input.deliveryMethod === "parcel_locker") {
    return input.parcelLockerCode;
  }

  if (input.deliveryMethod === "courier") {
    return input.deliveryAddress;
  }

  return null;
};

const buildTextEmail = (
  input: OrderConfirmationEmailInput,
  intendedRecipient: string | null,
) => {
  const productName = [input.rugTypeName, input.rugVariantName]
    .filter(Boolean)
    .join(" · ");
  const deliveryDetails = getDeliveryDetails(input);

  return [
    `Cześć ${input.customerName}!`,
    "",
    "Płatność została potwierdzona. Twoje zamówienie trafiło do pracowni Ruggy.",
    "",
    `Numer zamówienia: #${input.bookingId}`,
    `Dywan: ${productName}`,
    `Rozmiar: ${input.rugSizeLabel}`,
    `Termin: ${formatBookingDate(input.bookingDate)}`,
    `Dostawa: ${getDeliveryLabel(input.deliveryMethod)}${
      deliveryDetails ? `, ${deliveryDetails}` : ""
    }`,
    `Opłacona kwota: ${formatPriceCents(input.amountCents)}`,
    "",
    "Gdy rozpocznę realizację, będę informować Cię o kolejnych krokach.",
    `W razie pytań napisz do mnie na Instagramie: ${siteConfig.instagram}`,
    ...(intendedRecipient
      ? ["", `Tryb testowy. Docelowy odbiorca: ${intendedRecipient}`]
      : []),
    "",
    "Twój Wuja Dywaniarz",
    "Ruggy",
  ].join("\n");
};

const buildHtmlEmail = (
  input: OrderConfirmationEmailInput,
  intendedRecipient: string | null,
) => {
  const productName = [input.rugTypeName, input.rugVariantName]
    .filter(Boolean)
    .join(" · ");
  const deliveryDetails = getDeliveryDetails(input);
  const delivery = `${getDeliveryLabel(input.deliveryMethod)}${
    deliveryDetails ? `, ${deliveryDetails}` : ""
  }`;
  const detailRows = [
    ["Numer zamówienia", `#${input.bookingId}`],
    ["Dywan", productName],
    ["Rozmiar", input.rugSizeLabel],
    ["Termin", formatBookingDate(input.bookingDate)],
    ["Dostawa", delivery],
    ["Opłacona kwota", formatPriceCents(input.amountCents)],
  ];

  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Potwierdzenie zamówienia #${input.bookingId}</title>
  </head>
  <body style="margin:0;background:#f8f3e8;color:#142033;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">
      Płatność potwierdzona. Zamówienie #${input.bookingId} jest już w pracowni Ruggy.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f3e8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffaf0;border:2px solid #8b919a;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background:#2864f0;padding:28px 32px;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;">ruggy.</p>
                <h1 style="margin:0;font-size:28px;line-height:1.15;">Zamówienie przyjęte!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 12px;font-size:17px;line-height:1.6;">Cześć ${escapeHtml(input.customerName)}!</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
                  Płatność została potwierdzona. Twoje zamówienie trafiło do pracowni Ruggy.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  ${detailRows
                    .map(
                      ([label, value]) => `<tr>
                    <td style="padding:10px 0;border-bottom:1px solid #c9c4ba;color:#5d6674;font-size:14px;vertical-align:top;">${escapeHtml(label)}</td>
                    <td align="right" style="padding:10px 0;border-bottom:1px solid #c9c4ba;color:#142033;font-size:14px;font-weight:700;vertical-align:top;">${escapeHtml(value)}</td>
                  </tr>`,
                    )
                    .join("")}
                </table>
                <p style="margin:24px 0 0;font-size:16px;line-height:1.6;color:#374151;">
                  Gdy rozpocznę realizację, będę informować Cię o kolejnych krokach.
                </p>
                <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#5d6674;">
                  W razie pytań napisz do mnie na
                  <a href="${siteConfig.instagram}" style="color:#2864f0;font-weight:700;">Instagramie</a>.
                </p>
                ${
                  intendedRecipient
                    ? `<p style="margin:24px 0 0;padding:12px 14px;background:#dcecff;border-radius:12px;font-size:13px;line-height:1.5;color:#142033;">
                  Tryb testowy. Docelowy odbiorca: ${escapeHtml(intendedRecipient)}
                </p>`
                    : ""
                }
                <p style="margin:28px 0 0;font-size:15px;font-weight:700;line-height:1.5;">
                  Twój Wuja Dywaniarz<br>Ruggy
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export async function sendOrderConfirmationEmail(
  input: OrderConfirmationEmailInput,
): Promise<OrderConfirmationEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const testRecipient = process.env.RESEND_TEST_RECIPIENT?.trim() || null;

  if (!apiKey || !from) {
    return {
      success: false,
      reason: "not_configured",
      message:
        "Brakuje RESEND_API_KEY lub RESEND_FROM_EMAIL. Potwierdzenie email nie zostało wysłane.",
    };
  }

  const recipient = testRecipient ?? input.customerEmail;
  const testMode = testRecipient != null;
  const subject = `${testMode ? "[TEST] " : ""}Potwierdzenie zamówienia #${input.bookingId} w Ruggy`;
  const intendedRecipient = testMode ? input.customerEmail : null;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `order-confirmation/${input.stripeSessionId}/${
          testMode ? "test" : "customer"
        }`,
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text: buildTextEmail(input, intendedRecipient),
        html: buildHtmlEmail(input, intendedRecipient),
        tags: [{ name: "email_type", value: "order_confirmation" }],
      }),
      cache: "no-store",
      signal: createOutboundRequestSignal(OUTBOUND_REQUEST_TIMEOUT_MS.email),
    });

    if (!response.ok) {
      return {
        success: false,
        reason: "request_failed",
        message: `Resend API zwróciło status ${response.status}.`,
      };
    }

    const responseBody = (await response.json()) as { id?: string };

    return {
      success: true,
      emailId: responseBody.id ?? null,
      recipient,
      testMode,
    };
  } catch (error) {
    return {
      success: false,
      reason: "request_failed",
      message: formatOutboundRequestError("Resend API", error),
    };
  }
}

export type AgreedProjectPaymentEmailInput = {
  bookingId: number;
  stripeSessionId: string;
  customerName: string;
  customerEmail: string;
  projectReference: string;
  amountCents: number;
};

const buildAgreedProjectPaymentTextEmail = (
  input: AgreedProjectPaymentEmailInput,
) =>
  [
    `Cześć ${input.customerName}!`,
    "",
    "Płatność za uzgodniony projekt została potwierdzona.",
    "",
    `Numer zamówienia: #${input.bookingId}`,
    `Kwota: ${formatPriceCents(input.amountCents)}`,
    `Projekt: ${input.projectReference}`,
    "",
    "Płatność trafiła do pracowni Ruggy. W razie pytań napisz do mnie na Instagramie.",
    siteConfig.instagram,
    "",
    "Twój Wuja Dywaniarz",
    "Ruggy",
  ].join("\n");

const buildAgreedProjectPaymentHtmlEmail = (
  input: AgreedProjectPaymentEmailInput,
) => `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Potwierdzenie płatności #${input.bookingId}</title>
  </head>
  <body style="margin:0;background:#f8f3e8;color:#142033;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f3e8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffaf0;border:2px solid #8b919a;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background:#2864f0;padding:28px 32px;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;">ruggy.</p>
                <h1 style="margin:0;font-size:28px;line-height:1.15;">Płatność przyjęta!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 12px;font-size:17px;line-height:1.6;">Cześć ${escapeHtml(input.customerName)}!</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">Płatność za uzgodniony projekt została potwierdzona i trafiła do pracowni Ruggy.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr><td style="padding:10px 0;border-bottom:1px solid #c9c4ba;color:#5d6674;font-size:14px;">Numer zamówienia</td><td align="right" style="padding:10px 0;border-bottom:1px solid #c9c4ba;font-size:14px;font-weight:700;">#${input.bookingId}</td></tr>
                  <tr><td style="padding:10px 0;border-bottom:1px solid #c9c4ba;color:#5d6674;font-size:14px;vertical-align:top;">Projekt</td><td align="right" style="padding:10px 0;border-bottom:1px solid #c9c4ba;font-size:14px;font-weight:700;vertical-align:top;">${escapeHtml(input.projectReference)}</td></tr>
                  <tr><td style="padding:10px 0;color:#5d6674;font-size:14px;">Kwota</td><td align="right" style="padding:10px 0;font-size:14px;font-weight:700;">${escapeHtml(formatPriceCents(input.amountCents))}</td></tr>
                </table>
                <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#5d6674;">W razie pytań napisz do mnie na <a href="${siteConfig.instagram}" style="color:#2864f0;font-weight:700;">Instagramie</a>.</p>
                <p style="margin:28px 0 0;font-size:15px;font-weight:700;line-height:1.5;">Twój Wuja Dywaniarz<br>Ruggy</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

export async function sendAgreedProjectPaymentConfirmationEmail(
  input: AgreedProjectPaymentEmailInput,
): Promise<OrderConfirmationEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const testRecipient = process.env.RESEND_TEST_RECIPIENT?.trim() || null;

  if (!apiKey || !from) {
    return {
      success: false,
      reason: "not_configured",
      message:
        "Brakuje RESEND_API_KEY lub RESEND_FROM_EMAIL. Potwierdzenie email nie zostało wysłane.",
    };
  }

  const recipient = testRecipient ?? input.customerEmail;
  const testMode = testRecipient != null;
  const intendedRecipient = testMode ? input.customerEmail : null;
  const subject = `${testMode ? "[TEST] " : ""}Potwierdzenie płatności #${input.bookingId} w Ruggy`;
  const text = buildAgreedProjectPaymentTextEmail(input);
  const html = buildAgreedProjectPaymentHtmlEmail(input);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `agreed-project-payment/${input.stripeSessionId}/${
          testMode ? "test" : "customer"
        }`,
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text: intendedRecipient
          ? `${text}\n\nTryb testowy. Docelowy odbiorca: ${intendedRecipient}`
          : text,
        html,
        tags: [{ name: "email_type", value: "agreed_project_payment" }],
      }),
      cache: "no-store",
      signal: createOutboundRequestSignal(OUTBOUND_REQUEST_TIMEOUT_MS.email),
    });

    if (!response.ok) {
      return {
        success: false,
        reason: "request_failed",
        message: `Resend API zwróciło status ${response.status}.`,
      };
    }

    const responseBody = (await response.json()) as { id?: string };

    return {
      success: true,
      emailId: responseBody.id ?? null,
      recipient,
      testMode,
    };
  } catch (error) {
    return {
      success: false,
      reason: "request_failed",
      message: formatOutboundRequestError("Resend API", error),
    };
  }
}

export type QuoteRequestConfirmationEmailInput = {
  bookingId: number;
  customerName: string;
  customerEmail: string;
  rugTypeName: string;
  rugVariantName: string | null;
  rugSizeLabel: string;
  estimatedAmountCents: number;
  bookingDate: string;
  deliveryMethod: string | null;
  parcelLockerCode: string | null;
  deliveryAddress: string | null;
};

const buildQuoteRequestTextEmail = (
  input: QuoteRequestConfirmationEmailInput,
  intendedRecipient: string | null,
) => {
  const productName = [input.rugTypeName, input.rugVariantName]
    .filter(Boolean)
    .join(" · ");
  const deliveryDetails = getDeliveryDetails(input);

  return [
    `Cześć ${input.customerName}!`,
    "",
    "Otrzymałem Twoje zgłoszenie customowego dywanu do wyceny.",
    "",
    `Numer zgłoszenia: #${input.bookingId}`,
    `Dywan: ${productName}`,
    `Rozmiar: ${input.rugSizeLabel}`,
    `Szacunkowa kwota: ${formatPriceCents(input.estimatedAmountCents)}`,
    `Termin: ${formatBookingDate(input.bookingDate)}`,
    `Dostawa: ${getDeliveryLabel(input.deliveryMethod)}${
      deliveryDetails ? `, ${deliveryDetails}` : ""
    }`,
    "",
    "Ostateczną cenę i szczegóły realizacji ustalimy z Tobą na Instagramie.",
    `W razie pytań napisz do mnie: ${siteConfig.instagram}`,
    ...(intendedRecipient
      ? ["", `Tryb testowy. Docelowy odbiorca: ${intendedRecipient}`]
      : []),
    "",
    "Twój Wuja Dywaniarz",
    "Ruggy",
  ].join("\n");
};

const buildQuoteRequestHtmlEmail = (
  input: QuoteRequestConfirmationEmailInput,
  intendedRecipient: string | null,
) => {
  const productName = [input.rugTypeName, input.rugVariantName]
    .filter(Boolean)
    .join(" · ");
  const deliveryDetails = getDeliveryDetails(input);
  const delivery = `${getDeliveryLabel(input.deliveryMethod)}${
    deliveryDetails ? `, ${deliveryDetails}` : ""
  }`;
  const detailRows = [
    ["Numer zgłoszenia", `#${input.bookingId}`],
    ["Dywan", productName],
    ["Rozmiar", input.rugSizeLabel],
    ["Szacunkowa kwota", formatPriceCents(input.estimatedAmountCents)],
    ["Termin", formatBookingDate(input.bookingDate)],
    ["Dostawa", delivery],
  ];

  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Zgłoszenie do wyceny #${input.bookingId}</title>
  </head>
  <body style="margin:0;background:#f8f3e8;color:#142033;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">
      Zgłoszenie customowego dywanu #${input.bookingId} zostało przyjęte do wyceny.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f3e8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffaf0;border:2px solid #8b919a;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background:#2864f0;padding:28px 32px;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;">ruggy.</p>
                <h1 style="margin:0;font-size:28px;line-height:1.15;">Zgłoszenie przyjęte!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 12px;font-size:17px;line-height:1.6;">Cześć ${escapeHtml(input.customerName)}!</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">Otrzymałem Twoje zgłoszenie customowego dywanu do wyceny. Ostateczną cenę i szczegóły realizacji ustalimy z Tobą na Instagramie.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  ${detailRows
                    .map(
                      ([label, value]) => `<tr>
                    <td style="padding:10px 0;border-bottom:1px solid #c9c4ba;color:#5d6674;font-size:14px;vertical-align:top;">${escapeHtml(label)}</td>
                    <td align="right" style="padding:10px 0;border-bottom:1px solid #c9c4ba;color:#142033;font-size:14px;font-weight:700;vertical-align:top;">${escapeHtml(value)}</td>
                  </tr>`,
                    )
                    .join("")}
                </table>
                <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#5d6674;">W razie pytań napisz do mnie na <a href="${siteConfig.instagram}" style="color:#2864f0;font-weight:700;">Instagramie</a>.</p>
                ${
                  intendedRecipient
                    ? `<p style="margin:24px 0 0;padding:12px 14px;background:#dcecff;border-radius:12px;font-size:13px;line-height:1.5;color:#142033;">Tryb testowy. Docelowy odbiorca: ${escapeHtml(intendedRecipient)}</p>`
                    : ""
                }
                <p style="margin:28px 0 0;font-size:15px;font-weight:700;line-height:1.5;">Twój Wuja Dywaniarz<br>Ruggy</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export async function sendQuoteRequestConfirmationEmail(
  input: QuoteRequestConfirmationEmailInput,
): Promise<OrderConfirmationEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const testRecipient = process.env.RESEND_TEST_RECIPIENT?.trim() || null;

  if (!apiKey || !from) {
    return {
      success: false,
      reason: "not_configured",
      message:
        "Brakuje RESEND_API_KEY lub RESEND_FROM_EMAIL. Potwierdzenie email nie zostało wysłane.",
    };
  }

  const recipient = testRecipient ?? input.customerEmail;
  const testMode = testRecipient != null;
  const intendedRecipient = testMode ? input.customerEmail : null;
  const subject = `${testMode ? "[TEST] " : ""}Zgłoszenie do wyceny #${input.bookingId} w Ruggy`;
  const text = buildQuoteRequestTextEmail(input, intendedRecipient);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `quote-request/${input.bookingId}`,
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text,
        html: buildQuoteRequestHtmlEmail(input, intendedRecipient),
        tags: [{ name: "email_type", value: "quote_request_confirmation" }],
      }),
      cache: "no-store",
      signal: createOutboundRequestSignal(OUTBOUND_REQUEST_TIMEOUT_MS.email),
    });

    if (!response.ok) {
      return {
        success: false,
        reason: "request_failed",
        message: `Resend API zwróciło status ${response.status}.`,
      };
    }

    const responseBody = (await response.json()) as { id?: string };

    return {
      success: true,
      emailId: responseBody.id ?? null,
      recipient,
      testMode,
    };
  } catch (error) {
    return {
      success: false,
      reason: "request_failed",
      message: formatOutboundRequestError("Resend API", error),
    };
  }
}

export type OwnerBookingNotificationEmailInput = {
  bookingId: number;
  orderKind: "catalog_order" | "quote_request" | "agreed_project_payment";
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  rugTypeName: string;
  rugVariantName: string | null;
  rugSizeLabel: string | null;
  amountCents: number | null;
  bookingDate: string | null;
  deliveryMethod: string | null;
  parcelLockerCode: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  projectReference: string | null;
};

const ownerOrderKindLabels: Record<
  OwnerBookingNotificationEmailInput["orderKind"],
  string
> = {
  catalog_order: "Zamówienie opłacone online",
  quote_request: "Nowe zgłoszenie do wyceny",
  agreed_project_payment: "Opłacony uzgodniony projekt",
};

const buildOwnerBookingNotificationText = (
  input: OwnerBookingNotificationEmailInput,
  intendedRecipient: string | null,
) => {
  const productName = [input.rugTypeName, input.rugVariantName]
    .filter(Boolean)
    .join(" · ");
  const deliveryDetails = getDeliveryDetails(input);
  const delivery = `${getDeliveryLabel(input.deliveryMethod)}${
    deliveryDetails ? `, ${deliveryDetails}` : ""
  }`;

  return [
    ownerOrderKindLabels[input.orderKind],
    "",
    `Numer: #${input.bookingId}`,
    `Klient: ${input.customerName}`,
    `E-mail: ${input.customerEmail}`,
    `Telefon: ${input.customerPhone || "Brak danych"}`,
    `Dywan: ${productName}`,
    `Rozmiar: ${input.rugSizeLabel || "Brak danych"}`,
    `Kwota: ${
      input.amountCents == null
        ? "Do ustalenia"
        : formatPriceCents(input.amountCents)
    }`,
    `Termin: ${
      input.bookingDate ? formatBookingDate(input.bookingDate) : "Do ustalenia"
    }`,
    `Dostawa: ${delivery}`,
    ...(input.projectReference
      ? [`Projekt: ${input.projectReference}`]
      : []),
    ...(input.notes ? ["", `Uwagi: ${input.notes}`] : []),
    "",
    `Otwórz zamówienie: ${absoluteUrl(
      `/admin/dashboard?booking=${encodeURIComponent(String(input.bookingId))}`,
    )}`,
    ...(intendedRecipient
      ? ["", `Tryb testowy. Docelowy odbiorca: ${intendedRecipient}`]
      : []),
  ].join("\n");
};

const buildOwnerBookingNotificationHtml = (
  input: OwnerBookingNotificationEmailInput,
  intendedRecipient: string | null,
) => {
  const productName = [input.rugTypeName, input.rugVariantName]
    .filter(Boolean)
    .join(" · ");
  const deliveryDetails = getDeliveryDetails(input);
  const delivery = `${getDeliveryLabel(input.deliveryMethod)}${
    deliveryDetails ? `, ${deliveryDetails}` : ""
  }`;
  const adminUrl = absoluteUrl(
    `/admin/dashboard?booking=${encodeURIComponent(String(input.bookingId))}`,
  );
  const detailRows = [
    ["Numer", `#${input.bookingId}`],
    ["Klient", input.customerName],
    ["E-mail", input.customerEmail],
    ["Telefon", input.customerPhone || "Brak danych"],
    ["Dywan", productName],
    ["Rozmiar", input.rugSizeLabel || "Brak danych"],
    [
      "Kwota",
      input.amountCents == null
        ? "Do ustalenia"
        : formatPriceCents(input.amountCents),
    ],
    [
      "Termin",
      input.bookingDate ? formatBookingDate(input.bookingDate) : "Do ustalenia",
    ],
    ["Dostawa", delivery],
    ...(input.projectReference
      ? [["Projekt", input.projectReference] as [string, string]]
      : []),
  ];

  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(ownerOrderKindLabels[input.orderKind])} #${input.bookingId}</title>
  </head>
  <body style="margin:0;background:#f8f3e8;color:#142033;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f3e8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffaf0;border:2px solid #8b919a;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background:#2864f0;padding:28px 32px;color:#ffffff;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;">ruggy.</p>
                <h1 style="margin:0;font-size:26px;line-height:1.15;">${escapeHtml(ownerOrderKindLabels[input.orderKind])}</h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.5;">Zamówienie #${input.bookingId}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  ${detailRows
                    .map(
                      ([label, value]) => `<tr>
                    <td style="padding:10px 0;border-bottom:1px solid #c9c4ba;color:#5d6674;font-size:14px;vertical-align:top;">${escapeHtml(label)}</td>
                    <td align="right" style="padding:10px 0;border-bottom:1px solid #c9c4ba;color:#142033;font-size:14px;font-weight:700;vertical-align:top;">${escapeHtml(value)}</td>
                  </tr>`,
                    )
                    .join("")}
                </table>
                ${
                  input.notes
                    ? `<p style="margin:24px 0 0;padding:14px;background:#eef3ff;border-radius:12px;font-size:14px;line-height:1.6;color:#374151;"><strong>Uwagi:</strong><br>${escapeHtml(input.notes)}</p>`
                    : ""
                }
                <p style="margin:28px 0 0;"><a href="${adminUrl}" style="display:inline-block;background:#2864f0;color:#ffffff;text-decoration:none;border-radius:12px;padding:13px 18px;font-size:14px;font-weight:700;">Otwórz w panelu admina</a></p>
                ${
                  intendedRecipient
                    ? `<p style="margin:24px 0 0;padding:12px 14px;background:#dcecff;border-radius:12px;font-size:13px;line-height:1.5;color:#142033;">Tryb testowy. Docelowy odbiorca: ${escapeHtml(intendedRecipient)}</p>`
                    : ""
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export async function sendOwnerBookingNotificationEmail(
  input: OwnerBookingNotificationEmailInput,
): Promise<OrderConfirmationEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const ownerEmail =
    process.env.RESEND_OWNER_EMAIL?.trim() || "sklep@ruggy.pl";

  if (!apiKey || !from) {
    return {
      success: false,
      reason: "not_configured",
      message:
        "Brakuje RESEND_API_KEY lub RESEND_FROM_EMAIL. Powiadomienie właściciela nie zostało wysłane.",
    };
  }

  // Owner alerts must reach the owner even when customer email testing is
  // enabled with RESEND_TEST_RECIPIENT.
  const recipient = ownerEmail;
  const testMode = false;
  const intendedRecipient = null;
  const subject = `${testMode ? "[TEST] " : ""}${ownerOrderKindLabels[input.orderKind]} #${input.bookingId}`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `owner-booking-notification/${input.orderKind}/${input.bookingId}`,
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text: buildOwnerBookingNotificationText(input, intendedRecipient),
        html: buildOwnerBookingNotificationHtml(input, intendedRecipient),
        tags: [{ name: "email_type", value: "owner_booking_notification" }],
      }),
      cache: "no-store",
      signal: createOutboundRequestSignal(OUTBOUND_REQUEST_TIMEOUT_MS.email),
    });

    if (!response.ok) {
      return {
        success: false,
        reason: "request_failed",
        message: `Resend API zwróciło status ${response.status}.`,
      };
    }

    const responseBody = (await response.json()) as { id?: string };

    return {
      success: true,
      emailId: responseBody.id ?? null,
      recipient,
      testMode,
    };
  } catch (error) {
    return {
      success: false,
      reason: "request_failed",
      message: formatOutboundRequestError("Resend API", error),
    };
  }
}
