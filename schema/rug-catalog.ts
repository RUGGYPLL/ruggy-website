import * as z from "zod";
import { RUG_ORDER_MODES } from "@/lib/rug-order-mode";

// Shared by the admin catalog UI and the server actions behind it, so a field
// the form accepts is exactly the field the action writes to Supabase.

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugField = z
  .string()
  .trim()
  .min(2, "Slug musi mieć co najmniej 2 znaki")
  .max(60, "Slug może mieć maksymalnie 60 znaków")
  .regex(SLUG_PATTERN, "Slug: tylko małe litery, cyfry i myślniki");

// Empty textarea -> null, so the column stays NULL instead of holding "".
const optionalDescription = z
  .string()
  .trim()
  .max(500, "Opis może mieć maksymalnie 500 znaków")
  .nullish()
  .transform((value) => (value ? value : null));

export const rugTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nazwa musi mieć co najmniej 2 znaki")
    .max(80, "Nazwa może mieć maksymalnie 80 znaków"),
  slug: slugField,
  description: optionalDescription,
  leadTimeDays: z
    .number("Podaj czas realizacji w dniach")
    .int("Czas realizacji podaj w pełnych dniach")
    .min(1, "Czas realizacji to minimum 1 dzień")
    .max(365, "Czas realizacji to maksimum 365 dni"),
  displayOrder: z
    .number("Podaj kolejność")
    .int("Kolejność podaj liczbą całkowitą")
    .min(0, "Kolejność nie może być ujemna")
    .max(9999, "Kolejność to maksimum 9999"),
  isActive: z.boolean(),
  orderMode: z.enum(RUG_ORDER_MODES),
  // Flips the "opóźnienie" overlay on the category in the shop.
  hasDelay: z.boolean(),
});

export const rugVariantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nazwa musi mieć co najmniej 2 znaki")
    .max(80, "Nazwa może mieć maksymalnie 80 znaków"),
  slug: slugField,
  description: optionalDescription,
  displayOrder: z
    .number("Podaj kolejność")
    .int("Kolejność podaj liczbą całkowitą")
    .min(0, "Kolejność nie może być ujemna")
    .max(9999, "Kolejność to maksimum 9999"),
  isActive: z.boolean(),
});

export const rugSizeSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Podaj etykietę rozmiaru")
    .max(40, "Etykieta może mieć maksymalnie 40 znaków"),
  widthCm: z
    .number("Podaj dłuższy bok w centymetrach")
    .int("Wymiar podaj w pełnych centymetrach")
    .min(10, "Minimalny wymiar to 10 cm")
    .max(500, "Maksymalny wymiar to 500 cm"),
  priceCents: z
    .number("Podaj cenę")
    .int("Cena musi być kwotą w groszach")
    .min(100, "Cena to minimum 1 zł")
    .max(10_000_000, "Cena to maksimum 100 000 zł"),
  displayOrder: z
    .number("Podaj kolejność")
    .int("Kolejność podaj liczbą całkowitą")
    .min(0, "Kolejność nie może być ujemna")
    .max(9999, "Kolejność to maksimum 9999"),
  isActive: z.boolean(),
});

export type RugTypeInput = z.input<typeof rugTypeSchema>;
export type RugVariantInput = z.input<typeof rugVariantSchema>;
export type RugSizeInput = z.input<typeof rugSizeSchema>;

/** First validation message per field, keyed by field name. */
export const collectCatalogFieldErrors = (error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): Record<string, string> => {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && issue.message && !(key in fields)) {
      fields[key] = issue.message;
    }
  }

  return fields;
};

/** "PAPA DYWANY!" -> "papa-dywany"; used to prefill the slug of a new row. */
export const slugifyRugName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
