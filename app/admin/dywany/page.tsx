import {
  isMissingRugPhotosTable,
  mapRugPhotos,
  type RugPhotoRow,
} from "@/lib/rug-photos";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/auth/server-admin";
import { redirect } from "next/navigation";
import { normalizeRugOrderMode } from "@/lib/rug-order-mode";
import AdminShell from "../admin-shell";
import RugCatalogClient, {
  type CatalogRugType,
  type CatalogSize,
} from "./catalog-client";

type SizeRow = {
  id: number | string;
  label: string | null;
  width_cm: number | string | null;
  price_cents: number | string | null;
  is_active: boolean | null;
  display_order: number | string | null;
};

type VariantRow = {
  id: number | string;
  name: string | null;
  slug: string | null;
  description: string | null;
  is_active: boolean | null;
  display_order: number | string | null;
  rug_sizes: SizeRow[] | null;
};

type TypeRow = {
  id: number | string;
  name: string | null;
  slug: string | null;
  description: string | null;
  lead_time_days: number | string | null;
  is_active: boolean | null;
  has_delay: boolean | null;
  order_mode: string | null;
  display_order: number | string | null;
  rug_sizes: SizeRow[] | null;
  rug_variants: VariantRow[] | null;
};

const byDisplayOrder = <T extends { displayOrder: number; name?: string; label?: string }>(
  first: T,
  second: T,
) =>
  first.displayOrder - second.displayOrder ||
  (first.name ?? first.label ?? "").localeCompare(
    second.name ?? second.label ?? "",
    "pl-PL",
  );

const mapSizes = (rows: SizeRow[] | null): CatalogSize[] =>
  (rows ?? [])
    .map((row) => ({
      id: Number(row.id),
      label: row.label ?? "",
      widthCm: Number(row.width_cm ?? 0),
      priceCents: Number(row.price_cents ?? 0),
      isActive: row.is_active !== false,
      displayOrder: Number(row.display_order ?? 0),
    }))
    .toSorted(byDisplayOrder);

export default async function AdminRugCatalogPage() {
  const user = await getAdminUser();

  if (!user) {
    redirect("/admin/login");
  }

  const supabase = createAdminClient();
  const [
    { data: typeRows, error: typesError },
    { data: bookingRefs, error: bookingsError },
    { data: photoRows, error: photosError },
  ] = await Promise.all([
    supabase
      .from("rug_types")
      .select(
        "id, name, slug, description, lead_time_days, is_active, has_delay, order_mode, display_order, rug_sizes(id, label, width_cm, price_cents, is_active, display_order), rug_variants(id, name, slug, description, is_active, display_order, rug_sizes(id, label, width_cm, price_cents, is_active, display_order))",
      ),
    // Which catalog rows order history points at — the UI uses this to explain
    // up front why a row can only be deactivated, instead of failing on click.
    supabase.from("bookings").select("rug_type_id, rug_variant_id, rug_size_id"),
    // Kept out of the rug_types embed on purpose: before the photos migration
    // is applied this query fails on its own, instead of taking the whole
    // catalog down with it.
    supabase
      .from("rug_photos")
      .select(
        "id, rug_type_id, rug_variant_id, storage_path, is_cover, display_order",
      ),
  ]);

  const photosTableMissing = isMissingRugPhotosTable(photosError);
  const photosByTypeId = new Map<number, RugPhotoRow[]>();
  const photosByVariantId = new Map<number, RugPhotoRow[]>();

  for (const row of (photoRows ?? []) as Array<
    RugPhotoRow
  >) {
    if (row.rug_type_id != null) {
      const typeId = Number(row.rug_type_id);
      photosByTypeId.set(typeId, [...(photosByTypeId.get(typeId) ?? []), row]);
    }
    if (row.rug_variant_id != null) {
      const variantId = Number(row.rug_variant_id);
      photosByVariantId.set(variantId, [
        ...(photosByVariantId.get(variantId) ?? []),
        row,
      ]);
    }
  }

  const catalog: CatalogRugType[] = ((typeRows as TypeRow[] | null) ?? [])
    .map((row) => ({
      id: Number(row.id),
      name: row.name ?? "",
      slug: row.slug ?? "",
      description: row.description,
      leadTimeDays: row.lead_time_days == null ? null : Number(row.lead_time_days),
      isActive: row.is_active !== false,
      orderMode: normalizeRugOrderMode(row.order_mode),
      hasDelay: row.has_delay === true,
      displayOrder: Number(row.display_order ?? 0),
      photos: mapRugPhotos(photosByTypeId.get(Number(row.id))),
      sizes: mapSizes(row.rug_sizes),
      variants: (row.rug_variants ?? [])
        .map((variant) => ({
          id: Number(variant.id),
          name: variant.name ?? "",
          slug: variant.slug ?? "",
          description: variant.description,
          isActive: variant.is_active !== false,
          displayOrder: Number(variant.display_order ?? 0),
          photos: mapRugPhotos(photosByVariantId.get(Number(variant.id))),
          sizes: mapSizes(variant.rug_sizes),
        }))
        .toSorted(byDisplayOrder),
    }))
    .toSorted(byDisplayOrder);

  const usedTypeIds: number[] = [];
  const usedVariantIds: number[] = [];
  const usedSizeIds: number[] = [];

  for (const booking of bookingRefs ?? []) {
    if (booking.rug_type_id != null) usedTypeIds.push(Number(booking.rug_type_id));
    if (booking.rug_variant_id != null) {
      usedVariantIds.push(Number(booking.rug_variant_id));
    }
    if (booking.rug_size_id != null) usedSizeIds.push(Number(booking.rug_size_id));
  }

  return (
    <AdminShell
      userEmail={user.email}
      activeNav="catalog"
      title="Katalog dywanów"
      subtitle="Kategorie, podrodzaje i ceny"
    >
      {typesError || bookingsError ? (
        <div className="mb-5 rounded-2xl border-2 border-[var(--ruggy-coral)]/40 bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[var(--ruggy-error)]">
          Nie udało się pobrać pełnego katalogu. Sprawdź połączenie z Supabase.
        </div>
      ) : null}

      {photosTableMissing ? (
        <div className="mb-5 rounded-2xl border-2 border-[var(--ruggy-border-strong)] bg-[#fff1bf] px-4 py-3 text-sm font-semibold text-[var(--ruggy-ink)]">
          Zdjęcia są wyłączone, dopóki nie uruchomisz migracji{" "}
            <code className="font-black">
            supabase/migrations/20260801_add_rug_photos.sql oraz
            supabase/migrations/20260803_add_variant_rug_photos.sql
            </code>{" "}
          w Supabase. Reszta panelu działa normalnie.
        </div>
      ) : photosError ? (
        <div className="mb-5 rounded-2xl border-2 border-[var(--ruggy-coral)]/40 bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[var(--ruggy-error)]">
          Nie udało się pobrać zdjęć kategorii.
        </div>
      ) : null}

      <RugCatalogClient
        catalog={catalog}
        usedTypeIds={[...new Set(usedTypeIds)]}
        usedVariantIds={[...new Set(usedVariantIds)]}
        usedSizeIds={[...new Set(usedSizeIds)]}
        photosEnabled={!photosTableMissing}
      />
    </AdminShell>
  );
}
