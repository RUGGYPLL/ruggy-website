"use client";

import { CategoryRealizations } from "@/components/category-realizations";
import { OrderLegalNotice } from "@/components/order-legal-notice";
import type { GalleryPhoto } from "@/lib/gallery";
import {
  mapRugPhotos,
  resolveCategoryPhotos,
  resolveVariantPhotos,
  type RugPhotoRow,
} from "@/lib/rug-photos";
import { createClient } from "@/lib/supabase/client";
import { formatLocalDateKey } from "@/lib/booking-date";
import {
  calculateCustomRugPriceCents,
  formatCustomRugPriceRange,
  formatPriceCents,
} from "@/lib/custom-rug-price";
import {
  calculateDeliveryCostCents,
  DELIVERY_LABEL,
  formatDeliveryCostCents,
  type DeliveryMethod,
} from "@/lib/delivery-pricing";
import { RugDelayBanner } from "@/components/rug-delay-notice";
import { RUG_LEAD_TIME_LABEL } from "@/lib/rug-lead-time";
import {
  PAPADYWANY_SLUG,
  hasActiveRugVariants,
  usesDirectCheckout,
} from "@/lib/rug-order-mode";
import { siteConfig } from "@/lib/site-config";
import { bookingSchema } from "@/schema/booking";
import {
  ArrowLeft,
  AtSign,
  Check,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createCheckoutSession,
  createContactBooking,
  uploadReferenceImage,
} from "./actions";
import { ContentWarningGate } from "./content-warning-gate";
import { CustomerForm } from "./customer-form";
import { DatePicker } from "./date-picker";
import { DeliveryPicker } from "./delivery-picker";
import { useDialogChrome } from "./use-dialog-chrome";
import { FIELD_FOCUS_ORDER, type FieldErrors } from "./field-error";
import { ReferenceImageUpload } from "./reference-image-upload";
import { SizePicker } from "./size-picker";

// Re-exported so the booking form and the delivery price table can never drift
// apart on what a delivery method is.
export type { DeliveryMethod };

export type Booking = {
  rugTypeId: string;
  rugVariantId: number | null;
  pickedSize: number | null;
  customWidthCm: number | null;
  customHeightCm: number | null;
  pickupDate: Date | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNotes: string;
  deliveryMethod: DeliveryMethod | "";
  parcelLockerCode: string;
  parcelLockerAddress: string;
  deliveryStreet: string;
  deliveryBuildingNumber: string;
  deliveryPostalCode: string;
  deliveryCity: string;
};

type RugTypeSummary = {
  name: string;
  slug: string;
  description: string | null;
  has_delay: boolean | null;
  order_mode: string | null;
  rug_variants: Array<{ id: number | string; is_active: boolean | null }>;
};

// The size label, price and chosen subcategory are fetched inside SizePicker;
// it reports the resolved selection back up so the summary can confirm what
// the customer is buying before checkout.
export type ResolvedSelection = {
  sizeLabel: string | null;
  sizePriceCents: number | null;
  variantName: string | null;
};

const collectValidationMessages = (error: {
  issues: Array<{ message: string }>;
}): string[] => {
  const messages = error.issues
    .map((issue) => issue.message)
    .filter((message): message is string => Boolean(message));
  const unique = [...new Set(messages)];

  return unique.length ? unique : ["Nieprawidłowe dane."];
};

// Map Zod issues onto the form field they belong to (first path segment) so
// each control can render its own red border and inline message. First message
// per field wins; deeper paths collapse to their top-level field.
const collectFieldErrors = (error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): FieldErrors => {
  const fields: FieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && issue.message && !(key in fields)) {
      fields[key] = issue.message;
    }
  }

  return fields;
};

// Scroll to and focus the first invalid control, in visual order, so a keyboard
// or screen-reader user lands on the problem instead of hunting for it. Deferred
// a frame because delivery sub-fields only mount once a method is chosen.
const focusFirstInvalidField = (fields: FieldErrors) => {
  const firstField = FIELD_FOCUS_ORDER.find((field) => field in fields);
  if (!firstField) return;

  requestAnimationFrame(() => {
    const control = document.querySelector<HTMLElement>(
      `[data-field="${firstField}"]`,
    );
    if (!control) return;

    control.scrollIntoView({ behavior: "smooth", block: "center" });
    control.focus({ preventScroll: true });
  });
};

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const variantParam = searchParams.get("variant");
  const preselectedVariantId =
    variantParam && /^\d+$/.test(variantParam) ? Number(variantParam) : null;
  const [blockedDays, setBlockedDays] = useState<Date[]>([]);
  const [rugType, setRugType] = useState<RugTypeSummary | null>(null);
  const [realizations, setRealizations] = useState<GalleryPhoto[]>([]);
  const [submitMessage, setSubmitMessage] = useState<string>();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isContactComplete, setIsContactComplete] = useState(false);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAntiSlipOfferOpen, setIsAntiSlipOfferOpen] = useState(false);
  const [resolvedSelection, setResolvedSelection] = useState<ResolvedSelection>({
    sizeLabel: null,
    sizePriceCents: null,
    variantName: null,
  });
  const [prevVariantParam, setPrevVariantParam] = useState(preselectedVariantId);
  const [booking, setBooking] = useState<Booking>({
    rugTypeId: id,
    rugVariantId: preselectedVariantId,
    pickedSize: null,
    customWidthCm: null,
    customHeightCm: null,
    pickupDate: null,
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerNotes: "",
    deliveryMethod: "",
    parcelLockerCode: "",
    parcelLockerAddress: "",
    deliveryStreet: "",
    deliveryBuildingNumber: "",
    deliveryPostalCode: "",
    deliveryCity: "",
  });

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const loadPageData = async () => {
      const [
        { data: blockedDates },
        { data: selectedRugType },
        { data: parentPhotoRows },
        { data: variantPhotoRows },
      ] = await Promise.all([
        supabase.from("blocked_dates").select("date"),
        supabase
          .from("rug_types")
          .select(
            "name, slug, description, has_delay, order_mode, rug_variants(id, is_active)",
          )
          .eq("id", id)
          .single(),
        // Separate from the rug_types query so a missing rug_photos table (the
        // migration not applied yet) leaves the configurator fully usable.
        supabase
          .from("rug_photos")
          .select("id, rug_type_id, rug_variant_id, storage_path, is_cover, display_order")
          .eq("rug_type_id", id),
        preselectedVariantId != null
          ? supabase
              .from("rug_photos")
              .select(
                "id, rug_type_id, rug_variant_id, storage_path, is_cover, display_order",
              )
              .eq("rug_variant_id", preselectedVariantId)
          : Promise.resolve({ data: null }),
      ]);

      if (!isMounted) return;

      setBlockedDays(blockedDates?.map((item) => new Date(item.date)) ?? []);
      setRugType(selectedRugType);

      const parentPhotos = mapRugPhotos(
        parentPhotoRows as RugPhotoRow[] | null,
      );
      const variantPhotos = mapRugPhotos(
        variantPhotoRows as RugPhotoRow[] | null,
      );
      const gallery =
        preselectedVariantId != null
          ? resolveVariantPhotos({
              variantPhotos,
              parentSlug: selectedRugType?.slug,
              parentName: selectedRugType?.name ?? "Dywany",
              parentPhotos,
            })
          : resolveCategoryPhotos({
              slug: selectedRugType?.slug,
              name: selectedRugType?.name ?? "Dywany",
              photos: parentPhotos,
            });

      setRealizations(
        gallery.realizations,
      );
    };

    void loadPageData();

    return () => {
      isMounted = false;
    };
  }, [id, preselectedVariantId]);

  const isPapadywany = rugType?.slug === PAPADYWANY_SLUG;
  const hasSubcategories = hasActiveRugVariants(rugType?.rug_variants);
  const isDirectCheckout = rugType
    ? usesDirectCheckout(rugType.order_mode)
    : true;
  const hasDelay = rugType?.has_delay === true;

  // Any category with active subcategories picks one on the dedicated page
  // first, then hands the choice back as ?variant=.
  const redirectingToSubcategory =
    hasSubcategories && preselectedVariantId == null;

  // When the ?variant= changes (e.g. "Zmień podrodzaj" then a different pick),
  // mirror it into the booking and clear the size — adjusting state during
  // render, the recommended alternative to a setState-in-effect.
  if (preselectedVariantId !== prevVariantParam) {
    setPrevVariantParam(preselectedVariantId);
    if (preselectedVariantId != null) {
      setBooking((previous) => ({
        ...previous,
        rugVariantId: preselectedVariantId,
        pickedSize: null,
        customWidthCm: null,
        customHeightCm: null,
      }));
    }
  }

  useEffect(() => {
    if (redirectingToSubcategory) {
      router.replace(`/zamow/${id}/podrodzaj`);
    }
  }, [redirectingToSubcategory, id, router]);

  const submitBooking = async (antiSlipMat: boolean) => {
    if (isSubmitting) return;

    const bookingInput = {
      ...booking,
      pickupDate: booking.pickupDate
        ? formatLocalDateKey(booking.pickupDate)
        : "",
      referenceImagePath: undefined,
      referenceImageProof: undefined,
      antiSlipMat,
    };

    const validation = bookingSchema.safeParse(bookingInput);

    if (!validation.success) {
      const fields = collectFieldErrors(validation.error);
      setIsAntiSlipOfferOpen(false);
      setSubmitMessage(undefined);
      setValidationErrors(collectValidationMessages(validation.error));
      setFieldErrors(fields);
      focusFirstInvalidField(fields);
      return false;
    }

    setValidationErrors([]);
    setFieldErrors({});
    setIsAntiSlipOfferOpen(false);
    setIsSubmitting(true);
    setSubmitMessage(
      isDirectCheckout
        ? referenceImage
          ? "Przygotowuję zdjęcie i płatność..."
          : "Przygotowuję płatność..."
        : referenceImage
          ? "Przesyłam zdjęcie i zapisuję zgłoszenie..."
          : "Zapisuję zgłoszenie...",
    );

    try {
      let referenceImagePath: string | undefined;
      let referenceImageProof: string | undefined;

      if (referenceImage) {
        const uploadResponse = await uploadReferenceImage(referenceImage);

        if (!uploadResponse.success) {
          setSubmitMessage(uploadResponse.message);
          setIsSubmitting(false);
          return false;
        }

        referenceImagePath = uploadResponse.path;
        referenceImageProof = uploadResponse.proof;
      }

      if (isDirectCheckout) {
        const response = await createCheckoutSession({
          ...bookingInput,
          referenceImagePath,
          referenceImageProof,
        });

        if (!response.success) {
          setSubmitMessage(response.message);
          setIsSubmitting(false);
          return false;
        }

        window.location.href = response.checkoutUrl!;
        return true;
      }

      const response = await createContactBooking({
        ...bookingInput,
        referenceImagePath,
        referenceImageProof,
      });

      if (!response.success) {
        setSubmitMessage(response.message);
        setIsSubmitting(false);
        return false;
      }

      setSubmitMessage(undefined);
      setIsSubmitting(false);
      setIsContactComplete(true);
      return true;
    } catch (error) {
      console.error("Nie udało się przygotować zamówienia:", error);
      setSubmitMessage(
        "Nie udało się przygotować zamówienia. Spróbuj ponownie.",
      );
      setIsSubmitting(false);
      return false;
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) return;

    const validation = bookingSchema.safeParse({
      ...booking,
      pickupDate: booking.pickupDate
        ? formatLocalDateKey(booking.pickupDate)
        : "",
      referenceImagePath: undefined,
      antiSlipMat: false,
    });

    if (!validation.success) {
      const fields = collectFieldErrors(validation.error);
      setSubmitMessage(undefined);
      setValidationErrors(collectValidationMessages(validation.error));
      setFieldErrors(fields);
      focusFirstInvalidField(fields);
      return;
    }

    setSubmitMessage(undefined);
    setValidationErrors([]);
    setFieldErrors({});

    // The anti-slip mat is a paid add-on, so only offer it when the customer
    // is actually paying now. On the quote path we save the request directly.
    if (isDirectCheckout) {
      setIsAntiSlipOfferOpen(true);
    } else {
      void submitBooking(false);
    }
  };

  const selectedDate = booking.pickupDate
    ? new Intl.DateTimeFormat("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(booking.pickupDate)
    : "Nie wybrano";

  const customPriceCents = calculateCustomRugPriceCents(
    booking.customHeightCm,
    booking.customWidthCm,
  );
  // Ready sizes have a firm price; a custom rug only has the estimate, which is
  // still what decides whether the order clears the free-delivery threshold.
  const rugPriceCents = booking.pickedSize
    ? resolvedSelection.sizePriceCents
    : customPriceCents;
  const deliveryCostCents = calculateDeliveryCostCents(
    booking.deliveryMethod,
    rugPriceCents,
  );

  const selectedDelivery = booking.deliveryMethod
    ? `${DELIVERY_LABEL[booking.deliveryMethod]}${
        deliveryCostCents != null
          ? ` · ${formatDeliveryCostCents(deliveryCostCents)}`
          : ""
      }`
    : "Nie wybrano";

  const selectedSize = booking.pickedSize
    ? resolvedSelection.sizeLabel
      ? resolvedSelection.sizePriceCents != null
        ? `${resolvedSelection.sizeLabel} · ${formatPriceCents(
            resolvedSelection.sizePriceCents,
          )}`
        : resolvedSelection.sizeLabel
      : "Gotowy rozmiar"
    : customPriceCents
      ? `${
          booking.customWidthCm != null
            ? `${booking.customWidthCm} × ${booking.customHeightCm} cm`
            : `wysokość ${booking.customHeightCm} cm`
        } · ${formatCustomRugPriceRange(customPriceCents)}`
      : "Nie wybrano";

  if (redirectingToSubcategory) {
    return (
      <main
        className="flex min-h-screen items-center justify-center bg-[var(--ruggy-canvas)] px-5 text-[var(--ruggy-ink)]"
        role="status"
      >
        <p className="text-sm font-black text-[var(--ruggy-muted)]">
          Przenoszę do wyboru podrodzaju…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--ruggy-canvas)] text-[var(--ruggy-ink)]">
      {isPapadywany ? <ContentWarningGate /> : null}
      {isAntiSlipOfferOpen ? (
        <AntiSlipOfferDialog
          onAccept={() => void submitBooking(true)}
          onDecline={() => void submitBooking(false)}
        />
      ) : null}
      {isContactComplete ? <ContactSuccessDialog /> : null}

      <header className="border-b border-[var(--ruggy-border)] bg-[var(--ruggy-canvas)]">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <Link href="/" className="ruggy-wordmark text-4xl text-[var(--ruggy-ink)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-ink)]">
            ruggy<span className="text-[var(--ruggy-blue)]">.</span>
          </Link>
          <div className="flex items-center gap-1">
            {hasSubcategories ? (
              <Link
                href={`/zamow/${id}/podrodzaj`}
                className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-black text-[var(--ruggy-body)] transition-colors hover:bg-[var(--ruggy-blue-soft)] hover:text-[var(--ruggy-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-ink)]"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Zmień podrodzaj
              </Link>
            ) : (
              <Link
                href="/zamow"
                className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-black text-[var(--ruggy-body)] transition-colors hover:bg-[var(--ruggy-blue-soft)] hover:text-[var(--ruggy-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ruggy-ink)]"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Zmień wariant
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="ruggy-thread-bg bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-ink)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-5 px-5 py-7 sm:px-8 sm:py-9 lg:flex-row lg:items-end lg:px-10">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--ruggy-blue)]">
              Zamówienie
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Skonfiguruj swój dywan
            </h1>
            <p className="mt-3 text-base leading-7 text-[var(--ruggy-body)]">
              {rugType?.description ||
                "Wybierz szczegóły projektu, termin oraz sposób dostawy."}
            </p>
            {rugType ? (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)] px-4 py-2 text-sm font-black text-[var(--ruggy-ink)]">
                {isDirectCheckout ? (
                  <>
                    <CreditCard size={16} aria-hidden="true" />
                    Płacisz online i rezerwujesz termin
                  </>
                ) : (
                  <>
                    <AtSign size={16} aria-hidden="true" />
                    Zapiszę zgłoszenie, a cenę i płatność ustalimy na Instagramie
                  </>
                )}
              </p>
            ) : null}
            {hasDelay ? (
              <div className="mt-4">
                <RugDelayBanner />
              </div>
            ) : null}
          </div>

          <div className="border-s-2 border-[var(--ruggy-ink)] ps-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--ruggy-muted)]">
              {hasSubcategories ? "Wybrany podrodzaj" : "Wybrany wariant"}
            </p>
            <p className="mt-1 text-base font-black text-[var(--ruggy-ink)]">
              {hasSubcategories && resolvedSelection.variantName
                ? resolvedSelection.variantName
                : rugType?.name || `Wariant #${id}`}
            </p>
            {hasSubcategories && resolvedSelection.variantName ? (
              <p className="mt-0.5 text-xs font-bold text-[var(--ruggy-muted)]">
                {rugType?.name}
              </p>
            ) : null}
            <p className="mt-0.5 text-xs text-[var(--ruggy-muted)]">
              {hasDelay
                ? "Realizacja dłuższa niż zwykle"
                : `Realizacja ${RUG_LEAD_TIME_LABEL}`}
            </p>
          </div>
        </div>
      </section>

      {realizations.length ? (
        <CategoryRealizations
          photos={realizations}
          categoryName={realizations[0].category}
        />
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-7xl px-5 py-5 sm:px-8 sm:py-7 lg:px-10 lg:py-8"
      >
        <div className="grid gap-5">
          <FormPanel
            number="1"
            title="Projekt i termin"
            description="Wybierz rozmiar oraz dzień realizacji"
          >
            <div className="grid items-start gap-8 lg:grid-cols-2">
              <SizePicker
                id={id}
                booking={booking}
                setBooking={setBooking}
                fieldErrors={fieldErrors}
                onSelectionResolved={setResolvedSelection}
              />
              <DatePicker
                blockedDates={blockedDays}
                setBooking={setBooking}
                fieldErrors={fieldErrors}
              />
            </div>
          </FormPanel>

          <FormPanel
            number="2"
            title="Dostawa i dane zamawiającego"
            description="Wybierz sposób dostawy i podaj dane do kontaktu"
          >
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <section aria-labelledby="delivery-section-title">
                <h3
                  id="delivery-section-title"
                  className="mb-4 text-sm font-black uppercase tracking-[0.14em] text-[var(--ruggy-muted)]"
                >
                  Sposób dostawy
                </h3>
                <DeliveryPicker
                  booking={booking}
                  setBooking={setBooking}
                  fieldErrors={fieldErrors}
                  rugPriceCents={rugPriceCents}
                />
              </section>

              <section
                aria-labelledby="customer-section-title"
                className="border-t-2 border-[var(--ruggy-border)] pt-7 lg:border-s-2 lg:border-t-0 lg:ps-8 lg:pt-0"
              >
                <h3
                  id="customer-section-title"
                  className="mb-4 text-sm font-black uppercase tracking-[0.14em] text-[var(--ruggy-muted)]"
                >
                  Dane kontaktowe
                </h3>
                <CustomerForm
                  booking={booking}
                  setBooking={setBooking}
                  fieldErrors={fieldErrors}
                />
              </section>
            </div>
          </FormPanel>

          <FormPanel
            number="3"
            title="Materiał referencyjny"
            description="Na końcu dodaj zdjęcie, które będzie podstawą projektu"
          >
            <ReferenceImageUpload
              file={referenceImage}
              setFile={setReferenceImage}
            />
          </FormPanel>
        </div>

        <div className="sticky bottom-3 z-20 mt-5 rounded-[1.5rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)]/95 p-4 shadow-[0_14px_40px_rgba(31,26,22,0.18)] backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              {validationErrors.length ? (
                <div role="alert" className="space-y-1">
                  <p className="text-sm font-black text-[var(--ruggy-error)]">
                    Zanim ruszymy dalej, uzupełnij:
                  </p>
                  <ul className="space-y-0.5 text-sm font-bold text-[var(--ruggy-error)]">
                    {validationErrors.map((message) => (
                      <li key={message} className="flex items-start gap-1.5">
                        <span aria-hidden="true">•</span>
                        <span>{message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : submitMessage ? (
                <p className="text-sm font-black text-[var(--ruggy-ink)]" aria-live="polite">
                  {submitMessage}
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-[var(--ruggy-muted)]">
                  <span>
                    Rozmiar:{" "}
                    <strong className="font-black text-[var(--ruggy-ink)]">
                      {selectedSize}
                    </strong>
                  </span>
                  <span>
                    Termin:{" "}
                    <strong className="font-black text-[var(--ruggy-ink)]">
                      {selectedDate}
                    </strong>
                  </span>
                  <span>
                    Dostawa:{" "}
                    <strong className="font-black text-[var(--ruggy-ink)]">
                      {selectedDelivery}
                    </strong>
                  </span>
                </div>
              )}
              <p className="mt-2 flex items-center gap-2 text-xs font-bold text-[var(--ruggy-body)]">
                {isDirectCheckout ? (
                  <>
                    <ShieldCheck size={14} aria-hidden="true" />
                    Bezpieczna płatność online
                  </>
                ) : (
                  <>
                    <AtSign size={14} aria-hidden="true" />
                    Zapiszę kompletne zgłoszenie, a cenę i płatność ustalę z Tobą na Instagramie
                  </>
                )}
              </p>
              <div className="mt-3 max-w-2xl">
                <OrderLegalNotice
                  actionLabel={
                    isDirectCheckout
                      ? "Zapłać i zarezerwuj"
                      : "Skontaktuj się ze mną"
                  }
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--ruggy-blue)] px-6 text-sm font-black text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-ink)] disabled:cursor-wait disabled:opacity-70"
            >
              {isDirectCheckout ? (
                <CreditCard size={17} aria-hidden="true" />
              ) : (
                <AtSign size={17} aria-hidden="true" />
              )}
              {isSubmitting
                ? isDirectCheckout
                  ? "Przygotowywanie..."
                  : "Zapisywanie..."
                : isDirectCheckout
                  ? "Zapłać i zarezerwuj"
                  : "Skontaktuj się ze mną"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

// Shared modal chrome: scroll-lock, initial focus, Tab focus-trap, focus
// restore, and optional Escape-to-close — so every dialog behaves identically
// for keyboard and screen-reader users. Escape is opt-in: gate dialogs
// (content warning) and terminal success screens should not be dismissable.

function AntiSlipOfferDialog({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const acceptButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogChrome({
    onEscape: onDecline,
    initialFocusRef: acceptButtonRef,
  });

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--ruggy-ink)]/70 p-4 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="anti-slip-offer-title"
        aria-describedby="anti-slip-offer-description"
        className="w-full max-w-lg rounded-[2rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)] p-6 shadow-[8px_10px_0_var(--ruggy-yellow)] sm:p-8"
      >
        <h2
          id="anti-slip-offer-title"
          className="text-2xl font-black leading-tight text-[var(--ruggy-ink)] sm:text-3xl"
        >
          A weź se dorzuć podkład antypoślizgowy
        </h2>
        <p
          id="anti-slip-offer-description"
          className="mt-4 text-base leading-7 text-[var(--ruggy-body)]"
        >
          39 zł, co byś se kostki nie skręcił.
        </p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDecline}
            className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-[var(--ruggy-ink)] px-5 text-sm font-black transition-colors hover:bg-[var(--ruggy-blue-soft)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-ink)]"
          >
            Nie, dzięki
          </button>
          <button
            ref={acceptButtonRef}
            type="button"
            onClick={onAccept}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--ruggy-blue)] px-6 text-sm font-black text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-ink)]"
          >
            Chcę (+39 zł)
          </button>
        </div>
      </section>
    </div>
  );
}

function ContactSuccessDialog() {
  const instagramLinkRef = useRef<HTMLAnchorElement>(null);
  const dialogRef = useDialogChrome({ initialFocusRef: instagramLinkRef });

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[var(--ruggy-ink)]/70 p-4 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-success-title"
        aria-describedby="contact-success-description"
        className="w-full max-w-lg rounded-[2rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)] p-6 shadow-[8px_10px_0_var(--ruggy-yellow)] sm:p-8"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--ruggy-yellow)] text-[var(--ruggy-ink)]">
          <Check size={24} aria-hidden="true" />
        </span>
        <h2
          id="contact-success-title"
          className="mt-5 text-2xl font-black leading-tight text-[var(--ruggy-ink)] sm:text-3xl"
        >
          Zgłoszenie już u mnie!
        </h2>
        <p
          id="contact-success-description"
          className="mt-4 text-base leading-7 text-[var(--ruggy-body)]"
        >
          Mam Twój projekt i wszystkie szczegóły. Teraz napisz do mnie na
          Instagramie — dogadamy ostateczną cenę, płatność i resztę. Odpisuję
          osobiście, więc śmiało.
        </p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/zamow"
            className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-[var(--ruggy-ink)] px-5 text-sm font-black transition-colors hover:bg-[var(--ruggy-blue-soft)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-ink)]"
          >
            Wróć do wariantów
          </Link>
          <a
            ref={instagramLinkRef}
            href={siteConfig.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--ruggy-blue)] px-6 text-sm font-black text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-ink)]"
          >
            <AtSign size={17} aria-hidden="true" />
            Napisz na Instagramie
          </a>
        </div>
      </section>
    </div>
  );
}


function FormPanel({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.5rem] border-2 border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] p-5 shadow-[3px_4px_0_var(--ruggy-border)] sm:p-6">
      <div className="mb-6 flex items-center gap-3 border-b-2 border-[var(--ruggy-border)] pb-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-yellow)] text-sm font-black text-[var(--ruggy-ink)]">
          {number}
        </span>
        <div>
          <h2 className="text-lg font-black text-[var(--ruggy-ink)]">{title}</h2>
          <p className="text-xs font-bold text-[var(--ruggy-muted)]">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}
