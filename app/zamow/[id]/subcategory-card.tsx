import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatPriceCents } from "@/lib/custom-rug-price";
import type { GalleryPhoto } from "@/lib/gallery";
import type { RugOrderMode } from "@/lib/rug-order-mode";

type VariantSize = { price_cents: number | string; is_active: boolean | null };

interface SubcategoryCardProps {
  rugTypeId: number | string;
  id: number;
  name: string;
  sizes: VariantSize[];
  mode: RugOrderMode;
  cover?: GalleryPhoto;
}

// Cheapest active size in a subrodzaj → its "od X zł" starting price.
const fromPriceCents = (sizes: VariantSize[]): number | null => {
  const prices = (sizes ?? [])
    .filter((size) => size.is_active !== false)
    .map((size) => Number(size.price_cents))
    .filter((value) => Number.isFinite(value) && value > 0);

  return prices.length ? Math.min(...prices) : null;
};

// A papadywany subrodzaj shown as a category-style card that links into the
// details page with the subrodzaj preselected (?variant=).
export const SubcategoryCard = ({
  rugTypeId,
  id,
  name,
  sizes,
  mode,
  cover,
}: SubcategoryCardProps) => {
  const isCheckout = mode === "checkout";
  const price = isCheckout ? fromPriceCents(sizes) : null;

  return (
    <Link
      href={`/zamow/${rugTypeId}?variant=${id}`}
      className="group flex h-full flex-col overflow-hidden rounded-[2rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-surface)] shadow-[5px_6px_0_var(--ruggy-ink)] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-blue)]"
    >
      {/* Square + contained, same as the variant grid: the whole rug shows. */}
      <div className="relative aspect-square w-full overflow-hidden bg-white">
        {cover ? (
          <Image
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            src={cover.src}
            alt={name}
            className="object-contain transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[var(--ruggy-blue-soft)] text-4xl font-black text-[var(--ruggy-blue)]">
            {name.charAt(0)}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h2 className="text-xl font-black tracking-tight text-[var(--ruggy-ink)]">
          {name}
        </h2>

        <div className="mt-5 flex items-center justify-between gap-4 border-t-2 border-[var(--ruggy-border)] pt-4">
          <span className="min-w-0">
            <span className="block text-[0.7rem] font-black uppercase tracking-[0.12em] text-[var(--ruggy-muted)]">
              {isCheckout ? "Cena" : "Sposób zamówienia"}
            </span>
            <span className="block text-lg font-black text-[var(--ruggy-blue)]">
              {isCheckout
                ? price != null
                  ? `od ${formatPriceCents(price)}`
                  : "Brak ceny"
                : "Wycena na Instagramie"}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-black text-[var(--ruggy-ink)] transition-transform group-hover:translate-x-1">
            Wybierz
            <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
};
