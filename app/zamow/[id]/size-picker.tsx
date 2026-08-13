"use client";

import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Check, Ruler, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  calculateCustomRugPriceCents,
  CUSTOM_RUG_MAX_DIMENSION_CM,
  CUSTOM_RUG_MIN_DIMENSION_CM,
  formatCustomRugPriceRange,
} from "@/lib/custom-rug-price";
import {
  usesDirectCheckout,
} from "@/lib/rug-order-mode";
import { getPopularRugSizeLabel } from "@/lib/popular-rug-sizes";
import { radioTabIndex, useRadioGroupKeys } from "@/components/use-radio-group";
import type { Booking, ResolvedSelection } from "./page";
import {
  buildFieldClass,
  FieldError,
  fieldErrorId,
  type FieldErrors,
} from "./field-error";

type RugSize = {
  id: number;
  label: string;
  price_cents: number | string;
  is_active?: boolean | null;
  display_order?: number | string | null;
};

type RugVariant = {
  id: number;
  name: string;
  slug: string;
  is_active: boolean | null;
  display_order: number | string | null;
  rug_sizes: RugSize[];
};

type SizeData = {
  name: string;
  slug: string;
  order_mode: string | null;
  rug_sizes: RugSize[];
  rug_variants: RugVariant[];
};

type SizePickerProps = {
  id: string;
  booking: Booking;
  setBooking: Dispatch<SetStateAction<Booking>>;
  fieldErrors?: FieldErrors;
  onSelectionResolved?: Dispatch<SetStateAction<ResolvedSelection>>;
};

const getActiveSizes = (sizes: RugSize[]) =>
  sizes
    .filter((size) => size.is_active !== false)
    .toSorted(
      (first, second) =>
        Number(first.display_order ?? 0) - Number(second.display_order ?? 0),
    );

const getActiveVariants = (variants: RugVariant[]) =>
  variants
    .filter((variant) => variant.is_active !== false)
    .toSorted(
      (first, second) =>
        Number(first.display_order ?? 0) - Number(second.display_order ?? 0),
    );

const findPopularSize = (
  rugTypeSlug: string,
  sizes: RugSize[],
  rugVariantSlug?: string,
) => {
  const popularSizeLabel = getPopularRugSizeLabel(
    rugTypeSlug,
    rugVariantSlug,
  );

  return popularSizeLabel
    ? getActiveSizes(sizes).find((size) => size.label === popularSizeLabel)
    : undefined;
};

export const SizePicker = ({
  id,
  booking,
  setBooking,
  fieldErrors = {},
  onSelectionResolved,
}: SizePickerProps) => {
  const [sizeData, setSizeData] = useState<SizeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchSizes = async () => {
      setIsLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("rug_types")
        .select(`
          name,
          slug,
          order_mode,
          rug_sizes(id, label, price_cents, is_active, display_order),
          rug_variants(
            id,
            name,
            slug,
            is_active,
            display_order,
            rug_sizes(id, label, price_cents, is_active, display_order)
          )
        `)
        .eq("id", id)
        .single();

      if (!isMounted) return;

      if (error || !data) {
        setLoadError(true);
      } else {
        const nextSizeData = data as unknown as SizeData;
        setSizeData(nextSizeData);
        setLoadError(false);

        const activeVariants = getActiveVariants(nextSizeData.rug_variants);

        if (activeVariants.length) {
          // Any category with active variants is chosen on
          // /zamow/[id]/podrodzaj and arrives as the ?variant= param.
          setBooking((previous) => {
            const selectedVariant = activeVariants.find(
              (variant) => variant.id === previous.rugVariantId,
            );

            return {
              ...previous,
              rugVariantId: selectedVariant?.id ?? null,
              pickedSize: null,
              customWidthCm: null,
              customHeightCm: null,
            };
          });
        } else if (usesDirectCheckout(nextSizeData.order_mode)) {
          const availableSizes = getActiveSizes(nextSizeData.rug_sizes);

          setBooking((previous) => {
            const previousSizeIsAvailable = availableSizes.some(
              (size) => size.id === previous.pickedSize,
            );
            const defaultSize = findPopularSize(
              nextSizeData.slug,
              availableSizes,
            );

            return {
              ...previous,
              rugVariantId: null,
              pickedSize: previousSizeIsAvailable
                ? previous.pickedSize
                : defaultSize?.id ?? null,
              customWidthCm: null,
              customHeightCm: null,
            };
          });
        } else {
          setBooking((previous) => ({
            ...previous,
            rugVariantId: null,
            pickedSize: null,
          }));
        }
      }
      setIsLoading(false);
    };

    void fetchSizes();

    return () => {
      isMounted = false;
    };
  }, [id, setBooking]);

  const activeVariants = getActiveVariants(sizeData?.rug_variants ?? []);
  const hasSubcategories = activeVariants.length > 0;
  const isCustomType = Boolean(
    sizeData && !usesDirectCheckout(sizeData.order_mode),
  );
  const selectedVariant = activeVariants.find(
    (variant) => variant.id === booking.rugVariantId,
  );
  const availableSizes = getActiveSizes(
    hasSubcategories
      ? selectedVariant?.rug_sizes ?? []
      : sizeData?.rug_sizes ?? [],
  );
  const customPriceCents = calculateCustomRugPriceCents(
    booking.customHeightCm,
  );

  // Report the resolved selection (real size label/price + chosen subrodzaj) up
  // so the sticky summary and hero confirm what is being bought. The functional
  // update bails out when nothing changed, so a stable setState setter here can
  // never loop.
  const selectedSize = availableSizes.find(
    (size) => size.id === booking.pickedSize,
  );
  const resolvedSizeLabel = selectedSize?.label ?? null;
  const resolvedSizePriceCents = selectedSize
    ? Number(selectedSize.price_cents)
    : null;
  const resolvedVariantName = selectedVariant?.name ?? null;

  useEffect(() => {
    onSelectionResolved?.((previous) =>
      previous.sizeLabel === resolvedSizeLabel &&
      previous.sizePriceCents === resolvedSizePriceCents &&
      previous.variantName === resolvedVariantName
        ? previous
        : {
            sizeLabel: resolvedSizeLabel,
            sizePriceCents: resolvedSizePriceCents,
            variantName: resolvedVariantName,
          },
    );
  }, [
    resolvedSizeLabel,
    resolvedSizePriceCents,
    resolvedVariantName,
    onSelectionResolved,
  ]);

  // Once a papadywany subrodzaj is set (via the ?variant= param), default its
  // size to the popular format — but only while none is picked, so a manual
  // choice and a subrodzaj switch (which clears the size) both behave correctly.
  useEffect(() => {
    if (!hasSubcategories || booking.rugVariantId == null) return;
    if (booking.pickedSize != null || !sizeData) return;

    const variant = getActiveVariants(sizeData.rug_variants).find(
      (candidate) => candidate.id === booking.rugVariantId,
    );
    if (!variant) return;

    const popular = findPopularSize(
      sizeData.slug,
      variant.rug_sizes,
      variant.slug,
    );
    if (!popular) return;

    setBooking((previous) =>
      previous.rugVariantId === variant.id && previous.pickedSize == null
        ? { ...previous, pickedSize: popular.id }
        : previous,
    );
  }, [
    hasSubcategories,
    booking.rugVariantId,
    booking.pickedSize,
    sizeData,
    setBooking,
  ]);

  const choosePresetSize = (sizeId: number) => {
    setBooking((previous) => ({
      ...previous,
      pickedSize: sizeId,
      customWidthCm: null,
      customHeightCm: null,
    }));
  };

  const selectedSizeIndex = availableSizes.findIndex(
    (size) => size.id === booking.pickedSize,
  );
  const { containerRef: sizeGroupRef, onKeyDown: onSizeKeyDown } =
    useRadioGroupKeys(
      availableSizes.map((size) => size.id),
      selectedSizeIndex,
      (sizeId) => choosePresetSize(sizeId),
    );

  const updateCustomDimension = (
    field: "customWidthCm" | "customHeightCm",
    value: string,
  ) => {
    setBooking((previous) => ({
      ...previous,
      pickedSize: null,
      [field]: value === "" ? null : Number(value),
    }));
  };

  return (
    <section className="space-y-5" aria-labelledby="size-picker-title">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]">
          <Ruler className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3
            id="size-picker-title"
            className="text-lg font-black text-[var(--ruggy-ink)]"
          >
            Rozmiar dywanu
          </h3>
          <p className="mt-1 text-sm leading-6 text-[var(--ruggy-body)]">
            {isCustomType
              ? "Podaj własne wymiary, a pokażę Ci orientacyjną cenę."
              : hasSubcategories
                ? "Najpierw wybierz podrodzaj, a następnie jego rozmiar."
                : "Wybierz jeden z dostępnych formatów."}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] p-5 text-sm font-bold text-[var(--ruggy-muted)]" role="status">
          Ładuję dostępne rozmiary…
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border-2 border-[var(--ruggy-error)] bg-[var(--ruggy-surface)] p-5 text-sm font-bold text-[var(--ruggy-error)]" role="alert">
          Nie udało się pobrać rozmiarów. Odśwież stronę i spróbuj ponownie.
        </div>
      ) : isCustomType ? (
        <div className="rounded-[1.5rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-blue-soft)] p-5 shadow-[5px_6px_0_var(--ruggy-ink)] sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ruggy-yellow)] text-[var(--ruggy-ink)]">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-black text-[var(--ruggy-ink)]">
                Twój wymiar, moja włóczka
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--ruggy-body)]">
                Podaj wysokość dywanu. Szerokość możesz dodać, jeśli ma
                znaczenie dla projektu.
              </p>
            </div>
          </div>

          {/* Required dimension first: the optional one leading the pair read
              as if the whole size were optional. */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-black text-[var(--ruggy-ink)]">
                Wysokość (cm) *
              </span>
              <input
                type="number"
                min={CUSTOM_RUG_MIN_DIMENSION_CM}
                max={CUSTOM_RUG_MAX_DIMENSION_CM}
                step="1"
                inputMode="numeric"
                value={booking.customHeightCm ?? ""}
                onChange={(event) =>
                  updateCustomDimension("customHeightCm", event.target.value)
                }
                placeholder="np. 70"
                data-field="customHeightCm"
                className={buildFieldClass(Boolean(fieldErrors.customHeightCm))}
                aria-invalid={fieldErrors.customHeightCm ? true : undefined}
                aria-describedby={
                  fieldErrors.customHeightCm
                    ? fieldErrorId("customHeightCm")
                    : undefined
                }
                required
              />
              <FieldError
                id={fieldErrorId("customHeightCm")}
                message={fieldErrors.customHeightCm}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-black text-[var(--ruggy-ink)]">
                Szerokość (cm, opcjonalnie)
              </span>
              <input
                type="number"
                min={CUSTOM_RUG_MIN_DIMENSION_CM}
                max={CUSTOM_RUG_MAX_DIMENSION_CM}
                step="1"
                inputMode="numeric"
                value={booking.customWidthCm ?? ""}
                onChange={(event) =>
                  updateCustomDimension("customWidthCm", event.target.value)
                }
                placeholder="np. 100"
                data-field="customWidthCm"
                className={buildFieldClass(Boolean(fieldErrors.customWidthCm))}
                aria-invalid={fieldErrors.customWidthCm ? true : undefined}
                aria-describedby={
                  fieldErrors.customWidthCm
                    ? fieldErrorId("customWidthCm")
                    : undefined
                }
              />
              <FieldError
                id={fieldErrorId("customWidthCm")}
                message={fieldErrors.customWidthCm}
              />
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ruggy-muted)]">Podana wysokość</p>
              <p className="mt-1 text-xl font-black text-[var(--ruggy-ink)]">
                {booking.customHeightCm != null
                  ? `${booking.customHeightCm} cm`
                  : "Wpisz wysokość"}
              </p>
            </div>
            <div className="sm:text-end">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ruggy-muted)]">
                Cena orientacyjna
              </p>
              <p className="mt-1 text-2xl font-black text-[var(--ruggy-blue)]" aria-live="polite">
                {formatCustomRugPriceRange(customPriceCents)}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[var(--ruggy-body)]">
            Ostateczną cenę ustalę z Tobą na Instagramie.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {hasSubcategories && !selectedVariant ? (
            <div className="rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] p-5 text-sm font-bold text-[var(--ruggy-muted)]">
              Wybierz podrodzaj, aby zobaczyć dostępne rozmiary.
            </div>
          ) : availableSizes.length ? (
            <div
              ref={sizeGroupRef}
              onKeyDown={onSizeKeyDown}
              className="grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-labelledby="size-picker-title"
              aria-describedby="size-longer-side-note"
            >
              {availableSizes.map((size, index) => {
                const isSelected = booking.pickedSize === size.id;
                const isPopular =
                  sizeData != null &&
                  size.label ===
                    getPopularRugSizeLabel(
                      sizeData.slug,
                      selectedVariant?.slug,
                    );

                return (
                  <button
                    key={size.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={radioTabIndex(
                      isSelected,
                      index === 0,
                      booking.pickedSize != null,
                    )}
                    onClick={() => choosePresetSize(size.id)}
                    className={`relative flex min-h-20 items-center justify-between gap-4 rounded-2xl border-2 p-4 text-start transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-blue)] ${
                      isSelected
                        ? "border-[var(--ruggy-ink)] bg-[var(--ruggy-yellow)] shadow-[4px_5px_0_var(--ruggy-ink)]"
                        : "border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] hover:border-[var(--ruggy-ink)]"
                    }`}
                  >
                    {isPopular ? (
                      <span className="absolute -top-2 start-4 rounded-full border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-blue)] px-3 py-0.5 text-xs font-black uppercase text-white">
                        Popularne
                      </span>
                    ) : null}
                    <span>
                      <span className="block text-base font-black text-[var(--ruggy-ink)]">
                        {size.label}
                        <span
                          aria-hidden="true"
                          className="ms-0.5 align-super text-xs text-(--ruggy-blue)"
                        >
                          *
                        </span>
                      </span>
                      <span className="mt-1 block text-sm font-bold text-[var(--ruggy-body)]">
                        Gotowy format Ruggy
                      </span>
                    </span>
                    <span className="shrink-0 text-lg font-black text-[var(--ruggy-blue)]">
                      {Number(size.price_cents) / 100} zł
                    </span>
                    {isSelected ? (
                      <span className="absolute end-3 top-3 flex size-6 items-center justify-center rounded-full bg-[var(--ruggy-ink)] text-white">
                        <Check className="size-4" aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] p-5 text-sm font-bold text-[var(--ruggy-muted)]">
              Brak dostępnych rozmiarów dla tego wariantu.
            </div>
          )}

          {availableSizes.length ? (
            <p
              id="size-longer-side-note"
              className="text-xs leading-5 text-(--ruggy-body)"
            >
              * Podany wymiar to dłuższy bok dywanu.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
};
