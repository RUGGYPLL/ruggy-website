import { createPublicClient } from "@/lib/supabase/public";
import { CUSTOM_RUG_MIN_PRICE_CENTS } from "@/lib/custom-rug-price";
import { hasActiveRugVariants, usesDirectCheckout } from "@/lib/rug-order-mode";
import {
  mapRugPhotos,
  resolveCategoryPhotos,
  type RugPhotoRow,
} from "@/lib/rug-photos";
import { ArrowLeft, ArrowRight, CreditCard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PosterHero } from "@/components/poster-hero";
import { RugCard } from "./rug-card";

type RugSizeRow = { price_cents: number | string; is_active: boolean | null };

const minActivePriceCents = (
  sizes: RugSizeRow[] | null | undefined,
  variants:
    | Array<{ is_active: boolean | null; rug_sizes: RugSizeRow[] | null }>
    | null
    | undefined,
): number | null => {
  const prices = [
    ...(sizes ?? []),
    ...(variants ?? [])
      .filter((variant) => variant.is_active !== false)
      .flatMap((variant) => variant.rug_sizes ?? []),
  ]
    .filter((size) => size.is_active !== false)
    .map((size) => Number(size.price_cents))
    .filter((value) => Number.isFinite(value) && value > 0);

  return prices.length ? Math.min(...prices) : null;
};

export const metadata: Metadata = {
  title: "Zamów personalizowany dywan",
  description:
    "Wybierz wariant, rozmiar i termin wykonania ręcznie tuftowanego dywanu Ruggy.",
  alternates: { canonical: "/zamow" },
};

export const revalidate = 300;

export default async function ZamowPage() {
  const supabase = createPublicClient();
  const [{ data: rugTypes, error }, { data: photoRows }] = await Promise.all([
    supabase
      .from("rug_types")
      .select(
        "id, name, slug, description, has_delay, order_mode, rug_sizes(price_cents, is_active), rug_variants(is_active, rug_sizes(price_cents, is_active))",
      )
      .eq("is_active", true),
    // Deliberately a separate query, not an embed: if the photos migration has
    // not been applied yet this fails alone and every card falls back to its
    // curated cover, instead of taking the whole page down.
    supabase
      .from("rug_photos")
      .select("id, rug_type_id, storage_path, is_cover, display_order"),
  ]);

  const photosByTypeId = new Map<number, RugPhotoRow[]>();

  for (const row of (photoRows ?? []) as Array<
    RugPhotoRow & { rug_type_id: number | string }
  >) {
    const typeId = Number(row.rug_type_id);
    photosByTypeId.set(typeId, [...(photosByTypeId.get(typeId) ?? []), row]);
  }

  return (
    <main className="min-h-screen bg-[var(--ruggy-canvas)] text-[var(--ruggy-ink)]">
      <header className="border-b border-[var(--ruggy-border)]">
        <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <Link href="/" className="ruggy-wordmark text-4xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-ink)]">
            ruggy<span className="text-[var(--ruggy-blue)]">.</span>
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors hover:bg-[var(--ruggy-blue-soft)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-ink)]">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Wróć na stronę
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
        <PosterHero
          words={[
            { text: "Wybierz" },
            { text: "bazę", emphasis: true },
            { text: "dla" },
            { text: "swojego" },
            { text: "pomysłu." },
          ]}
          description="Przejrzyj dostępne warianty. Rozmiar, inspirację, termin i dostawę ustawisz spokojnie w kolejnym kroku."
        />

        {error ? (
          <div className="mt-10 rounded-2xl border-2 border-[var(--ruggy-error)] bg-[var(--ruggy-surface)] p-6">
            <p className="text-base font-bold text-[var(--ruggy-ink)]">
              Nie udało się pobrać typów dywanów.
            </p>
            <p className="mt-2 text-base text-[var(--ruggy-body)]">
              Odśwież stronę albo spróbuj ponownie za chwilę.
            </p>
          </div>
        ) : rugTypes?.length ? (
          <ul className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {rugTypes.map((rug) => {
              const isCheckout = usesDirectCheckout(rug.order_mode);
              const hasSubcategories = hasActiveRugVariants(rug.rug_variants);
              const { cover } = resolveCategoryPhotos({
                slug: rug.slug,
                name: rug.name,
                photos: mapRugPhotos(photosByTypeId.get(Number(rug.id))),
              });

              return (
                <li key={rug.id}>
                  <RugCard
                    id={rug.id}
                    slug={rug.slug}
                    name={rug.name}
                    description={rug.description}
                    mode={isCheckout ? "checkout" : "quote"}
                    hasDelay={rug.has_delay === true}
                    hasSubcategories={hasSubcategories}
                    cover={cover}
                    fromPriceCents={
                      isCheckout
                        ? minActivePriceCents(rug.rug_sizes, rug.rug_variants)
                        : CUSTOM_RUG_MIN_PRICE_CENTS
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-10 rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] p-8 text-center">
            <p className="text-base font-bold text-[var(--ruggy-ink)]">
              Brak aktywnych wariantów.
            </p>
            <p className="mt-2 text-base text-[var(--ruggy-body)]">
              Aktualnie nie ma dostępnych typów dywanów do zamówienia.
            </p>
          </div>
        )}

        <div className="mt-14 border-t-2 border-[var(--ruggy-border)] pt-10">
          <Link
            href="/zamow/zaplac"
            className="group flex items-center justify-between gap-4 rounded-[1.5rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)] p-5 shadow-[3px_4px_0_var(--ruggy-ink)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-blue)] sm:p-6"
          >
            <span className="flex min-w-0 items-center gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-yellow)] text-[var(--ruggy-ink)]">
                <CreditCard className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-xs font-black uppercase tracking-[0.12em] text-[var(--ruggy-muted)]">
                  Płatność za ustalony projekt
                </span>
                <span className="block text-sm font-black text-[var(--ruggy-ink)] sm:text-base">
                  Masz już dogadany projekt? Zapłać tutaj
                </span>
              </span>
            </span>
            <ArrowRight
              className="size-5 shrink-0 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </div>
      </section>
    </main>
  );
}
