export const PIWODYWANY_SLUG = "piwodywany";
export const PAPADYWANY_SLUG = "papadywany";

export const RUG_ORDER_MODES = ["quote", "checkout"] as const;
export type RugOrderMode = (typeof RUG_ORDER_MODES)[number];

export const normalizeRugOrderMode = (
  value: string | null | undefined,
): RugOrderMode => (value === "checkout" ? "checkout" : "quote");

export const usesDirectCheckout = (
  mode: string | null | undefined,
) => normalizeRugOrderMode(mode) === "checkout";

export function hasActiveRugVariants(
  variants:
    | Array<{ is_active?: boolean | null }>
    | null
    | undefined,
) {
  return (variants ?? []).some((variant) => variant.is_active !== false);
}
