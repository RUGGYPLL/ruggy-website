export const CUSTOM_RUG_MIN_PRICE_CENTS = 24900;
export const CUSTOM_RUG_RATE_CENTS_PER_HEIGHT_CM = 420;
export const CUSTOM_RUG_BASE_WIDTH_CM = 100;
export const CUSTOM_RUG_MIN_DIMENSION_CM = 20;
export const CUSTOM_RUG_MAX_DIMENSION_CM = 300;

export function calculateCustomRugPriceCents(
  heightCm: number | null | undefined,
  widthCm: number | null | undefined = null,
) {
  if (
    !Number.isFinite(heightCm) ||
    heightCm == null ||
    heightCm < CUSTOM_RUG_MIN_DIMENSION_CM ||
    heightCm > CUSTOM_RUG_MAX_DIMENSION_CM
  ) {
    return null;
  }

  if (
    widthCm != null &&
    (!Number.isFinite(widthCm) ||
      widthCm < CUSTOM_RUG_MIN_DIMENSION_CM ||
      widthCm > CUSTOM_RUG_MAX_DIMENSION_CM)
  ) {
    return null;
  }

  const rawPriceCents =
    CUSTOM_RUG_MIN_PRICE_CENTS +
    (widthCm == null
      ? heightCm * CUSTOM_RUG_RATE_CENTS_PER_HEIGHT_CM
      : (widthCm / CUSTOM_RUG_BASE_WIDTH_CM) *
        heightCm *
        CUSTOM_RUG_RATE_CENTS_PER_HEIGHT_CM);

  return Math.ceil(rawPriceCents / 1000) * 1000;
}

/**
 * A custom rug is quoted, not priced off a shelf, so the checkout shows a band
 * around the list price instead of a single number that would read like a firm
 * offer. Bounds are widened to full 10 zł — the same step the list price is
 * rounded to — so the range is never narrower than the ±20% it promises.
 */
export const CUSTOM_RUG_PRICE_RANGE_RATIO = 0.2;

const PRICE_ROUNDING_STEP_CENTS = 1000;

export function calculateCustomRugPriceRangeCents(priceCents: number | null) {
  if (priceCents == null) return null;

  const spread = priceCents * CUSTOM_RUG_PRICE_RANGE_RATIO;

  return {
    fromCents:
      Math.floor((priceCents - spread) / PRICE_ROUNDING_STEP_CENTS) *
      PRICE_ROUNDING_STEP_CENTS,
    toCents:
      Math.ceil((priceCents + spread) / PRICE_ROUNDING_STEP_CENTS) *
      PRICE_ROUNDING_STEP_CENTS,
  };
}

export function formatPriceCents(priceCents: number | null) {
  if (priceCents == null) return "Cena pojawi się po wpisaniu wysokości";

  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

export function formatCustomRugPriceRange(priceCents: number | null) {
  const range = calculateCustomRugPriceRangeCents(priceCents);

  if (!range) return formatPriceCents(null);

  const amount = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 });

  return `${amount.format(range.fromCents / 100)}–${formatPriceCents(
    range.toCents,
  )}`;
}

export function formatCustomRugSizeLabel(
  widthCm: number | null | undefined,
  heightCm: number,
) {
  return widthCm != null
    ? `Własny rozmiar ${widthCm} × ${heightCm} cm`
    : `Własny rozmiar · wysokość ${heightCm} cm`;
}
