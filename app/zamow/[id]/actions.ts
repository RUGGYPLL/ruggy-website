"use server";

import {
  getMinimumBookingDateKey,
  isValidDateKey,
} from "@/lib/booking-date";
import {
  calculateCustomRugPriceCents,
  formatCustomRugSizeLabel,
} from "@/lib/custom-rug-price";
import {
  hasActiveRugVariants,
  usesDirectCheckout,
} from "@/lib/rug-order-mode";
import {
  addAntiSlipMatPrice,
  ANTI_SLIP_MAT_LABEL,
  ANTI_SLIP_MAT_PRICE_CENTS,
  appendAntiSlipMatLabel,
} from "@/lib/order-addons";
import {
  formatDeliveryAddress,
  formatParcelLocker,
} from "@/lib/delivery-address";
import {
  calculateDeliveryCostCents,
  formatDeliveryLineItemName,
} from "@/lib/delivery-pricing";
import { bookingSchema } from "@/schema/booking";
import { validateImageUpload } from "@/lib/image-upload";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  consumeContactBookingLimit,
  consumeCheckoutSessionLimit,
  consumeReferenceImageUploadLimit,
} from "@/lib/upload-rate-limit";
import {
  createReferenceImageProof,
  isValidReferenceImageProof,
} from "@/lib/security/reference-image-proof";
import { getCheckoutReturnOrigin } from "@/lib/security/origin";
import { headers } from "next/headers";
import {
  sendOwnerBookingNotificationEmail,
  sendQuoteRequestConfirmationEmail,
} from "@/lib/order-confirmation-email";
import { sendQuoteRequestWhatsAppNotification } from "@/lib/whatsapp-notification";

const REFERENCE_IMAGES_BUCKET = "booking-reference-images";
const MAX_REFERENCE_IMAGE_SIZE = 5 * 1024 * 1024;

async function validateBookingDate(
  supabase: ReturnType<typeof createAdminClient>,
  pickupDate: string,
) {
  if (!isValidDateKey(pickupDate)) {
    return "Wybrano nieprawidłowy termin.";
  }

  if (pickupDate < getMinimumBookingDateKey()) {
    return "Najbliższy możliwy termin realizacji jest za 5 dni.";
  }

  const { data: blockedDate, error } = await supabase
    .from("blocked_dates")
    .select("date")
    .eq("date", pickupDate)
    .maybeSingle();

  if (error) {
    console.error("Nie udało się sprawdzić dostępności terminu:", error);
    return "Nie udało się sprawdzić dostępności terminu.";
  }

  return blockedDate
    ? "Wybrany termin jest niedostępny. Wybierz inny dzień."
    : null;
}

export async function uploadReferenceImage(file: File) {
  const validation = await validateImageUpload(file, MAX_REFERENCE_IMAGE_SIZE);

  if (!validation.ok) {
    return { success: false, message: validation.message };
  }

  const { buffer: fileBuffer, extension, contentType } = validation.image;
  const rateLimit = await consumeReferenceImageUploadLimit();

  if (rateLimit.unavailable) {
    return {
      success: false,
      message: "Nie udało się sprawdzić limitu przesyłania zdjęć.",
    };
  }

  if (!rateLimit.allowed) {
    return {
      success: false,
      message: "Osiągnięto limit przesyłania zdjęć. Spróbuj później.",
    };
  }

  const path = `bookings/${crypto.randomUUID()}.${extension}`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(REFERENCE_IMAGES_BUCKET)
    .upload(path, fileBuffer, {
      cacheControl: "3600",
      contentType,
      upsert: false,
    });

  if (error) {
    console.error("Nie udało się przesłać zdjęcia:", error);
    return { success: false, message: "Nie udało się przesłać zdjęcia." };
  }

  return {
    success: true,
    path,
    proof: createReferenceImageProof(path),
  };
}

export async function createCheckoutSession(input: unknown) {
  const result = bookingSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      message: result.error.issues[0]?.message ?? "Nieprawidłowe dane.",
    };
  }

  const booking = result.data;
  const checkoutRateLimit = await consumeCheckoutSessionLimit();

  if (checkoutRateLimit.unavailable || !checkoutRateLimit.allowed) {
    return {
      success: false,
      message: checkoutRateLimit.unavailable
        ? "Nie udało się sprawdzić limitu płatności."
        : "Utworzono zbyt wiele płatności. Spróbuj ponownie później.",
    };
  }

  if (
    booking.referenceImagePath &&
    !isValidReferenceImageProof(
      booking.referenceImagePath,
      booking.referenceImageProof,
    )
  ) {
    return { success: false, message: "Zdjęcie referencyjne jest nieprawidłowe." };
  }

  const supabase = createAdminClient();
  const dateError = await validateBookingDate(supabase, booking.pickupDate);

  if (dateError) return { success: false, message: dateError };

  const { data: rugType, error: rugTypeError } = await supabase
    .from("rug_types")
    .select("id, name, slug, order_mode, rug_variants(id, name, is_active)")
    .eq("id", Number(booking.rugTypeId))
    .single();

  if (rugTypeError || !rugType) {
    return { success: false, message: "Nie znaleziono typu dywanu." };
  }

  if (!usesDirectCheckout(rugType.order_mode)) {
    return {
      success: false,
      message: "Ten wariant wymaga indywidualnej wyceny na Instagramie.",
    };
  }

  if (
    booking.pickedSize == null ||
    booking.customWidthCm != null ||
    booking.customHeightCm != null
  ) {
    return {
      success: false,
      message: "Wybierz dostępny rozmiar dywanu.",
    };
  }

  const { data: size, error: sizeError } = await supabase
    .from("rug_sizes")
    .select("id, label, price_cents, rug_type_id, rug_variant_id, is_active")
    .eq("id", booking.pickedSize)
    .maybeSingle();

  if (sizeError || !size || size.is_active === false) {
    return {
      success: false,
      message: "Wybrany rozmiar jest niedostępny.",
    };
  }

  let rugVariant: { id: number | string; name: string } | null = null;

  if (hasActiveRugVariants(rugType.rug_variants)) {
    if (booking.rugVariantId == null) {
      return { success: false, message: "Wybierz podrodzaj dywanu." };
    }

    const { data: selectedVariant, error: variantError } = await supabase
      .from("rug_variants")
      .select("id, name")
      .eq("id", booking.rugVariantId)
      .eq("rug_type_id", Number(rugType.id))
      .eq("is_active", true)
      .maybeSingle();

    if (
      variantError ||
      !selectedVariant ||
      Number(size.rug_variant_id) !== Number(selectedVariant.id)
    ) {
      return {
        success: false,
        message: "Wybrany rozmiar nie należy do tego podrodzaju.",
      };
    }

    rugVariant = selectedVariant;
  } else if (
    Number(size.rug_type_id) !== Number(rugType.id) ||
    size.rug_variant_id != null
  ) {
    return {
      success: false,
      message: "Wybrany rozmiar nie należy do tego wariantu dywanu.",
    };
  }

  const sizeLabel = size.label;
  const priceCents = Number(size.price_cents);

  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return {
      success: false,
      message: "Wybrany rozmiar nie ma prawidłowej ceny.",
    };
  }

  const checkoutOrigin = getCheckoutReturnOrigin(
    (await headers()).get("origin"),
  );

  if (!checkoutOrigin) {
    return {
      success: false,
      message: "Adres powrotu po płatności jest nieprawidłowy.",
    };
  }

  const successUrl = new URL("/zamow/sukces", checkoutOrigin);
  successUrl.search = "?session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl = new URL("/zamow/anulowano", checkoutOrigin);

  const stripe = getStripe();
  const lineItems = [
    {
      price_data: {
        currency: "pln",
        unit_amount: priceCents,
        product_data: {
          name: `${rugType.name}${rugVariant ? ` · ${rugVariant.name}` : ""} · ${sizeLabel}`,
        },
      },
      quantity: 1,
    },
  ];

  if (booking.antiSlipMat) {
    lineItems.push({
      price_data: {
        currency: "pln",
        unit_amount: ANTI_SLIP_MAT_PRICE_CENTS,
        product_data: {
          name: ANTI_SLIP_MAT_LABEL,
        },
      },
      quantity: 1,
    });
  }

  // Free delivery is simply the absence of a delivery line — a zero-amount line
  // would only add noise to the Stripe receipt.
  const deliveryCostCents =
    calculateDeliveryCostCents(booking.deliveryMethod, priceCents) ?? 0;

  if (deliveryCostCents > 0) {
    lineItems.push({
      price_data: {
        currency: "pln",
        unit_amount: deliveryCostCents,
        product_data: {
          name: formatDeliveryLineItemName(booking.deliveryMethod),
        },
      },
      quantity: 1,
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: booking.customerEmail,
    success_url: successUrl.toString(),
    cancel_url: cancelUrl.toString(),
    line_items: lineItems,
    metadata: {
      rugTypeId: booking.rugTypeId,
      rugTypeName: rugType.name,
      rugTypeSlug: rugType.slug,
      rugVariantId: rugVariant ? String(rugVariant.id) : "",
      rugVariantName: rugVariant?.name ?? "",
      pickedSize: String(booking.pickedSize),
      rugSizeLabel: sizeLabel,
      customWidthCm: "",
      customHeightCm: "",
      pickupDate: booking.pickupDate,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone ?? "",
      customerNotes: booking.customerNotes ?? "",
      deliveryMethod: booking.deliveryMethod,
      deliveryCostCents: String(deliveryCostCents),
      parcelLockerCode: formatParcelLocker(booking),
      deliveryAddress: formatDeliveryAddress(booking),
      referenceImagePath: booking.referenceImagePath ?? "",
      antiSlipMat: String(booking.antiSlipMat),
    },
  });

  return {
    success: true,
    checkoutUrl: session.url,
  };
}

export async function createContactBooking(input: unknown) {
  const result = bookingSchema.safeParse(input);

  if (!result.success) {
    return {
      success: false,
      message: result.error.issues[0]?.message ?? "Nieprawidłowe dane.",
    };
  }

  const rateLimit = await consumeContactBookingLimit();

  if (rateLimit.unavailable) {
    return {
      success: false,
      message: "Nie udało się teraz zapisać zgłoszenia. Spróbuj ponownie.",
    };
  }

  if (!rateLimit.allowed) {
    return {
      success: false,
      message: "Wysłano zbyt wiele zgłoszeń. Spróbuj ponownie później.",
    };
  }

  const booking = result.data;
  if (
    booking.referenceImagePath &&
    !isValidReferenceImageProof(
      booking.referenceImagePath,
      booking.referenceImageProof,
    )
  ) {
    return { success: false, message: "Zdjęcie referencyjne jest nieprawidłowe." };
  }

  const supabase = createAdminClient();
  const dateError = await validateBookingDate(supabase, booking.pickupDate);

  if (dateError) return { success: false, message: dateError };

  const { data: rugType, error: rugTypeError } = await supabase
    .from("rug_types")
    .select("id, name, order_mode, rug_variants(id, name, is_active)")
    .eq("id", Number(booking.rugTypeId))
    .single();

  if (rugTypeError || !rugType) {
    return { success: false, message: "Nie znaleziono typu dywanu." };
  }

  if (usesDirectCheckout(rugType.order_mode)) {
    return {
      success: false,
      message: "Ten wariant należy opłacić online po wybraniu rozmiaru.",
    };
  }

  if (booking.pickedSize != null || booking.customHeightCm == null) {
    return {
      success: false,
      message: "Podaj własne wymiary dywanu.",
    };
  }

  let rugVariant: { id: number | string; name: string } | null = null;

  if (hasActiveRugVariants(rugType.rug_variants)) {
    if (booking.rugVariantId == null) {
      return { success: false, message: "Wybierz podrodzaj dywanu." };
    }

    rugVariant =
      rugType.rug_variants.find(
        (variant) =>
          variant.is_active !== false &&
          Number(variant.id) === booking.rugVariantId,
      ) ?? null;

    if (!rugVariant) {
      return {
        success: false,
        message: "Wybrany podrodzaj nie należy do tej kategorii.",
      };
    }
  } else if (booking.rugVariantId != null) {
    return {
      success: false,
      message: "Ta kategoria nie ma dostępnych podrodzajów.",
    };
  }

  const estimatedPriceCents = calculateCustomRugPriceCents(
    booking.customHeightCm,
    booking.customWidthCm,
  );

  if (estimatedPriceCents == null) {
    return {
      success: false,
      message: "Wymiary dywanu są poza dozwolonym zakresem.",
    };
  }

  const { data: createdBooking, error } = await supabase
    .from("bookings")
    .insert({
      rug_type_id: Number(rugType.id),
      rug_variant_id: rugVariant ? Number(rugVariant.id) : null,
      rug_size_id: null,
      rug_type_name: rugType.name,
      rug_variant_name: rugVariant?.name ?? null,
      rug_size_label: appendAntiSlipMatLabel(
        formatCustomRugSizeLabel(
          booking.customWidthCm,
          booking.customHeightCm,
        ),
        booking.antiSlipMat,
      ),
      // A quote is settled on Instagram, but the stored estimate carries the
      // delivery cost the customer was shown so the two never disagree.
      price_cents:
        addAntiSlipMatPrice(estimatedPriceCents, booking.antiSlipMat) +
        (calculateDeliveryCostCents(
          booking.deliveryMethod,
          estimatedPriceCents,
        ) ?? 0),
      customer_name: booking.customerName,
      customer_email: booking.customerEmail,
      customer_phone: booking.customerPhone?.trim() || null,
      notes: booking.customerNotes?.trim() || null,
      booking_date: booking.pickupDate,
      status: "awaiting_quote",
      stripe_session_id: null,
      stripe_payment_intent_id: null,
      expires_at: null,
      delivery_method: booking.deliveryMethod,
      parcel_locker_code: formatParcelLocker(booking) || null,
      delivery_address: formatDeliveryAddress(booking) || null,
      reference_image_path: booking.referenceImagePath ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !createdBooking) {
    console.error(
      "Nie udało się zapisać zgłoszenia w Supabase:",
      JSON.stringify({
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      }),
    );
    return {
      success: false,
      message: "Nie udało się zapisać zgłoszenia. Spróbuj ponownie.",
    };
  }

  const bookingId = Number(createdBooking.id);
  const storedPriceCents =
    addAntiSlipMatPrice(estimatedPriceCents, booking.antiSlipMat) +
    (calculateDeliveryCostCents(
      booking.deliveryMethod,
      estimatedPriceCents,
    ) ?? 0);
  const emailResult = await sendQuoteRequestConfirmationEmail({
    bookingId,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    rugTypeName: rugType.name,
    rugVariantName: rugVariant?.name ?? null,
    rugSizeLabel: appendAntiSlipMatLabel(
      formatCustomRugSizeLabel(
        booking.customWidthCm,
        booking.customHeightCm,
      ),
      booking.antiSlipMat,
    ),
    estimatedAmountCents: storedPriceCents,
    bookingDate: booking.pickupDate,
    deliveryMethod: booking.deliveryMethod,
    parcelLockerCode: formatParcelLocker(booking) || null,
    deliveryAddress: formatDeliveryAddress(booking) || null,
  });

  if (!emailResult.success) {
    console.error(
      "Nie udało się wysłać potwierdzenia zgłoszenia wyceny:",
      JSON.stringify(emailResult),
    );
  }

  const ownerEmailResult = await sendOwnerBookingNotificationEmail({
    bookingId,
    orderKind: "quote_request",
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone?.trim() || null,
    rugTypeName: rugType.name,
    rugVariantName: rugVariant?.name ?? null,
    rugSizeLabel: appendAntiSlipMatLabel(
      formatCustomRugSizeLabel(
        booking.customWidthCm,
        booking.customHeightCm,
      ),
      booking.antiSlipMat,
    ),
    amountCents: storedPriceCents,
    bookingDate: booking.pickupDate,
    deliveryMethod: booking.deliveryMethod,
    parcelLockerCode: formatParcelLocker(booking) || null,
    deliveryAddress: formatDeliveryAddress(booking) || null,
    notes: booking.customerNotes?.trim() || null,
    projectReference: null,
  });

  if (!ownerEmailResult.success) {
    console.error(
      "Nie udało się wysłać powiadomienia email do właściciela:",
      JSON.stringify(ownerEmailResult),
    );
  }

  const notificationResult =
    await sendQuoteRequestWhatsAppNotification(bookingId);

  const notificationStatus = notificationResult.success ? "sent" : "failed";
  const { error: notificationTrackingError } = await supabase
    .from("bookings")
    .update({
      whatsapp_notification_status: notificationStatus,
      whatsapp_notification_error: notificationResult.success
        ? null
        : notificationResult.message,
      whatsapp_notification_sent_at: notificationResult.success
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (notificationTrackingError) {
    console.error(
      "Nie udało się zapisać statusu powiadomienia WhatsApp:",
      JSON.stringify({
        code: notificationTrackingError.code,
        message: notificationTrackingError.message,
      }),
    );
  }

  if (!notificationResult.success) {
    console.error(
      "Nie udało się wysłać powiadomienia WhatsApp:",
      JSON.stringify(notificationResult),
    );
  }

  return {
    success: true,
    bookingId,
    emailSent: emailResult.success,
    notificationSent: notificationResult.success,
  };
}
