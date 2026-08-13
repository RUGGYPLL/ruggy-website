"use server";

import { validateImageUpload } from "@/lib/image-upload";
import {
  isMissingRugPhotosTable,
  MAX_RUG_PHOTO_SIZE,
  RUG_CATALOG_PHOTOS_BUCKET,
} from "@/lib/rug-photos";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthorizedAdminClient } from "@/lib/auth/server-admin";
import {
  rugSizeSchema,
  rugTypeSchema,
  rugVariantSchema,
  type RugSizeInput,
  type RugTypeInput,
  type RugVariantInput,
} from "@/schema/rug-catalog";
import { revalidatePath } from "next/cache";

export type CatalogActionResult = {
  success: boolean;
  message?: string;
  /** Set by create actions so the caller can attach photos to the fresh row. */
  rugTypeId?: number;
  rugVariantId?: number;
};

// Server Functions are reachable by direct POST, so every entry point below
// re-checks the admin session before touching the service-role client.
const getAdminClient = getAuthorizedAdminClient;

const SESSION_EXPIRED: CatalogActionResult = {
  success: false,
  message: "Sesja administratora wygasła. Zaloguj się ponownie.",
};

const isPositiveId = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0;

const firstIssueMessage = (error: { issues: Array<{ message: string }> }) =>
  error.issues[0]?.message ?? "Nieprawidłowe dane.";

// The public order flow is ISR-cached; the configurator itself reads live but
// its parent routes do not. Refresh every surface that renders the catalog.
const revalidateCatalog = () => {
  revalidatePath("/admin/dywany");
  revalidatePath("/zamow");
  revalidatePath("/zamow/[id]", "page");
  revalidatePath("/zamow/[id]/podrodzaj", "page");
};

/** Postgres unique-violation, i.e. the slug is already taken. */
const isDuplicateSlug = (error: { code?: string }) => error.code === "23505";

// Until supabase/migrations/20260801_add_rug_photos.sql is applied the panel
// still runs — it just can't store photos, and says so plainly instead of
// surfacing a Postgres error code.
const MISSING_PHOTOS_TABLE_MESSAGE =
  "Brakuje migracji zdjęć. Uruchom supabase/migrations/20260801_add_rug_photos.sql oraz supabase/migrations/20260803_add_variant_rug_photos.sql w Supabase.";

// A row that a booking points at is order history: its name/price snapshot is
// what the customer bought. Deleting it would orphan (or silently blank) that
// record, so deletion is refused and deactivation offered instead.
const countBookingsReferencing = async (
  supabase: ReturnType<typeof createAdminClient>,
  column: "rug_type_id" | "rug_variant_id" | "rug_size_id",
  ids: number[],
) => {
  if (!ids.length) return 0;

  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .in(column, ids);

  if (error) {
    console.error("Nie udało się sprawdzić powiązanych zamówień:", error);
    return null;
  }

  return count ?? 0;
};

const blockedByBookingsMessage = (
  subject: "Ta kategoria" | "Ten podrodzaj" | "Ten rozmiar",
) => {
  const [deleted, deactivated] =
    subject === "Ta kategoria"
      ? ["usunięta", "nieaktywną"]
      : ["usunięty", "nieaktywny"];

  return `${subject} ma powiązane zamówienia i nie może zostać ${deleted}. Ustaw ${
    subject === "Ta kategoria" ? "ją" : "go"
  } jako ${deactivated} — zniknie z oferty, a historia zamówień zostanie nietknięta.`;
};

/* ------------------------------------------------------------------ types */

export async function createRugType(
  input: RugTypeInput,
): Promise<CatalogActionResult> {
  const parsed = rugTypeSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, message: firstIssueMessage(parsed.error) };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const values = parsed.data;
  const { data: createdType, error } = await supabase
    .from("rug_types")
    .insert({
      name: values.name,
      slug: values.slug,
      description: values.description,
      lead_time_days: values.leadTimeDays,
      display_order: values.displayOrder,
      is_active: values.isActive,
      order_mode: values.orderMode,
      has_delay: values.hasDelay,
    })
    .select("id")
    .single();

  if (error || !createdType) {
    console.error("Nie udało się dodać kategorii dywanów:", error);
    return {
      success: false,
      message:
        error && isDuplicateSlug(error)
          ? "Kategoria z tym slugiem już istnieje."
          : "Nie udało się dodać kategorii.",
    };
  }

  revalidateCatalog();
  return {
    success: true,
    message: `Kategoria „${values.name}” została dodana.`,
    // The creation form holds its photos in memory until the row exists; it
    // uploads them against this id as soon as the insert lands.
    rugTypeId: Number(createdType.id),
  };
}

export async function updateRugType(
  id: number,
  input: RugTypeInput,
): Promise<CatalogActionResult> {
  if (!isPositiveId(id)) {
    return { success: false, message: "Nieprawidłowa kategoria." };
  }

  const parsed = rugTypeSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, message: firstIssueMessage(parsed.error) };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const values = parsed.data;
  const { error } = await supabase
    .from("rug_types")
    .update({
      name: values.name,
      slug: values.slug,
      description: values.description,
      lead_time_days: values.leadTimeDays,
      display_order: values.displayOrder,
      is_active: values.isActive,
      order_mode: values.orderMode,
      has_delay: values.hasDelay,
    })
    .eq("id", id);

  if (error) {
    console.error("Nie udało się zapisać kategorii dywanów:", error);
    return {
      success: false,
      message: isDuplicateSlug(error)
        ? "Kategoria z tym slugiem już istnieje."
        : "Nie udało się zapisać kategorii.",
    };
  }

  revalidateCatalog();
  return { success: true, message: "Kategoria została zapisana." };
}

export async function deleteRugType(id: number): Promise<CatalogActionResult> {
  if (!isPositiveId(id)) {
    return { success: false, message: "Nieprawidłowa kategoria." };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const [{ data: variantRows, error: variantsError }, { data: sizeRows }] =
    await Promise.all([
      supabase.from("rug_variants").select("id").eq("rug_type_id", id),
      supabase.from("rug_sizes").select("id").eq("rug_type_id", id),
    ]);

  if (variantsError) {
    console.error("Nie udało się pobrać podrodzajów kategorii:", variantsError);
    return { success: false, message: "Nie udało się usunąć kategorii." };
  }

  const variantIds = (variantRows ?? []).map((row) => Number(row.id));
  const sizeIds = (sizeRows ?? []).map((row) => Number(row.id));

  if (variantIds.length) {
    const { data: variantSizeRows, error: variantSizesError } = await supabase
      .from("rug_sizes")
      .select("id")
      .in("rug_variant_id", variantIds);

    if (variantSizesError) {
      console.error(
        "Nie udało się pobrać rozmiarów podrodzajów:",
        variantSizesError,
      );
      return { success: false, message: "Nie udało się usunąć kategorii." };
    }

    sizeIds.push(...(variantSizeRows ?? []).map((row) => Number(row.id)));
  }

  const [typeUsage, variantUsage, sizeUsage] = await Promise.all([
    countBookingsReferencing(supabase, "rug_type_id", [id]),
    countBookingsReferencing(supabase, "rug_variant_id", variantIds),
    countBookingsReferencing(supabase, "rug_size_id", sizeIds),
  ]);

  if (typeUsage == null || variantUsage == null || sizeUsage == null) {
    return { success: false, message: "Nie udało się usunąć kategorii." };
  }

  if (typeUsage + variantUsage + sizeUsage > 0) {
    return {
      success: false,
      message: blockedByBookingsMessage("Ta kategoria"),
    };
  }

  // Foreign keys remove rows from the database, but Storage objects need an
  // explicit cleanup. Read both owners before deleting the child variants.
  const [typePhotoResult, variantPhotoResult] = await Promise.all([
    supabase.from("rug_photos").select("storage_path").eq("rug_type_id", id),
    variantIds.length
      ? supabase
          .from("rug_photos")
          .select("storage_path")
          .in("rug_variant_id", variantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (
    (typePhotoResult.error && !isMissingRugPhotosTable(typePhotoResult.error)) ||
    (variantPhotoResult.error &&
      !isMissingRugPhotosTable(variantPhotoResult.error))
  ) {
    console.error(
      "Nie udało się pobrać zdjęć kategorii:",
      typePhotoResult.error ?? variantPhotoResult.error,
    );
    return { success: false, message: "Nie udało się usunąć kategorii." };
  }

  const storagePaths = [
    ...(typePhotoResult.data ?? []),
    ...(variantPhotoResult.data ?? []),
  ].map((row) => row.storage_path);

  // Children first: rug_sizes and rug_variants both point back at the type, so
  // the parent row can only go once nothing references it.
  if (sizeIds.length) {
    const { error } = await supabase.from("rug_sizes").delete().in("id", sizeIds);

    if (error) {
      console.error("Nie udało się usunąć rozmiarów kategorii:", error);
      return { success: false, message: "Nie udało się usunąć rozmiarów kategorii." };
    }
  }

  if (variantIds.length) {
    const { error } = await supabase
      .from("rug_variants")
      .delete()
      .in("id", variantIds);

    if (error) {
      console.error("Nie udało się usunąć podrodzajów kategorii:", error);
      return {
        success: false,
        message: "Nie udało się usunąć podrodzajów kategorii.",
      };
    }
  }

  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage
      .from(RUG_CATALOG_PHOTOS_BUCKET)
      .remove(storagePaths);

    if (storageError) {
      console.error("Nie udało się usunąć plików zdjęć:", storageError);
    }
  }

  const { error } = await supabase.from("rug_types").delete().eq("id", id);

  if (error) {
    console.error("Nie udało się usunąć kategorii dywanów:", error);
    return { success: false, message: "Nie udało się usunąć kategorii." };
  }

  revalidateCatalog();
  return { success: true, message: "Kategoria została usunięta." };
}

/* --------------------------------------------------------------- variants */

export async function createRugVariant(
  rugTypeId: number,
  input: RugVariantInput,
): Promise<CatalogActionResult> {
  if (!isPositiveId(rugTypeId)) {
    return { success: false, message: "Nieprawidłowa kategoria." };
  }

  const parsed = rugVariantSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, message: firstIssueMessage(parsed.error) };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const values = parsed.data;
  const { data: createdVariant, error } = await supabase
    .from("rug_variants")
    .insert({
      rug_type_id: rugTypeId,
      name: values.name,
      slug: values.slug,
      description: values.description,
      display_order: values.displayOrder,
      is_active: values.isActive,
    })
    .select("id")
    .single();

  if (error || !createdVariant) {
    console.error("Nie udało się dodać podrodzaju:", error);
    return {
      success: false,
      message: isDuplicateSlug(error)
        ? "Podrodzaj z tym slugiem już istnieje w tej kategorii."
        : "Nie udało się dodać podrodzaju.",
    };
  }

  revalidateCatalog();
  return {
    success: true,
    message: `Podrodzaj „${values.name}” został dodany.`,
    rugVariantId: Number(createdVariant.id),
  };
}

export async function updateRugVariant(
  id: number,
  input: RugVariantInput,
): Promise<CatalogActionResult> {
  if (!isPositiveId(id)) {
    return { success: false, message: "Nieprawidłowy podrodzaj." };
  }

  const parsed = rugVariantSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, message: firstIssueMessage(parsed.error) };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const values = parsed.data;
  const { error } = await supabase
    .from("rug_variants")
    .update({
      name: values.name,
      slug: values.slug,
      description: values.description,
      display_order: values.displayOrder,
      is_active: values.isActive,
    })
    .eq("id", id);

  if (error) {
    console.error("Nie udało się zapisać podrodzaju:", error);
    return {
      success: false,
      message: isDuplicateSlug(error)
        ? "Podrodzaj z tym slugiem już istnieje w tej kategorii."
        : "Nie udało się zapisać podrodzaju.",
    };
  }

  revalidateCatalog();
  return { success: true, message: "Podrodzaj został zapisany." };
}

export async function deleteRugVariant(
  id: number,
): Promise<CatalogActionResult> {
  if (!isPositiveId(id)) {
    return { success: false, message: "Nieprawidłowy podrodzaj." };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const { data: sizeRows, error: sizesError } = await supabase
    .from("rug_sizes")
    .select("id")
    .eq("rug_variant_id", id);

  if (sizesError) {
    console.error("Nie udało się pobrać rozmiarów podrodzaju:", sizesError);
    return { success: false, message: "Nie udało się usunąć podrodzaju." };
  }

  const sizeIds = (sizeRows ?? []).map((row) => Number(row.id));
  const [variantUsage, sizeUsage] = await Promise.all([
    countBookingsReferencing(supabase, "rug_variant_id", [id]),
    countBookingsReferencing(supabase, "rug_size_id", sizeIds),
  ]);

  if (variantUsage == null || sizeUsage == null) {
    return { success: false, message: "Nie udało się usunąć podrodzaju." };
  }

  if (variantUsage + sizeUsage > 0) {
    return {
      success: false,
      message: blockedByBookingsMessage("Ten podrodzaj"),
    };
  }

  const { data: photoRows, error: photosError } = await supabase
    .from("rug_photos")
    .select("storage_path")
    .eq("rug_variant_id", id);

  if (photosError && !isMissingRugPhotosTable(photosError)) {
    console.error("Nie udało się pobrać zdjęć podrodzaju:", photosError);
    return { success: false, message: "Nie udało się usunąć podrodzaju." };
  }

  const storagePaths = (photoRows ?? []).map((row) => row.storage_path);

  if (sizeIds.length) {
    const { error } = await supabase.from("rug_sizes").delete().in("id", sizeIds);

    if (error) {
      console.error("Nie udało się usunąć rozmiarów podrodzaju:", error);
      return {
        success: false,
        message: "Nie udało się usunąć rozmiarów podrodzaju.",
      };
    }
  }

  const { error } = await supabase.from("rug_variants").delete().eq("id", id);

  if (error) {
    console.error("Nie udało się usunąć podrodzaju:", error);
    return { success: false, message: "Nie udało się usunąć podrodzaju." };
  }

  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage
      .from(RUG_CATALOG_PHOTOS_BUCKET)
      .remove(storagePaths);

    if (storageError) {
      console.error("Nie udało się usunąć plików zdjęć podrodzaju:", storageError);
    }
  }

  revalidateCatalog();
  return { success: true, message: "Podrodzaj został usunięty." };
}

/* ------------------------------------------------------------------ sizes */

export async function createRugSize(
  owner: { rugTypeId: number | null; rugVariantId: number | null },
  input: RugSizeInput,
): Promise<CatalogActionResult> {
  const ownsType = isPositiveId(owner.rugTypeId);
  const ownsVariant = isPositiveId(owner.rugVariantId);

  // A size hangs off exactly one owner: the category (its sizes are shown
  // directly) or one of its subrodzajs. Both at once would double-list it.
  if (ownsType === ownsVariant) {
    return {
      success: false,
      message: "Rozmiar musi należeć do kategorii albo do podrodzaju.",
    };
  }

  const parsed = rugSizeSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, message: firstIssueMessage(parsed.error) };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const values = parsed.data;
  const { error } = await supabase.from("rug_sizes").insert({
    rug_type_id: ownsType ? owner.rugTypeId : null,
    rug_variant_id: ownsVariant ? owner.rugVariantId : null,
    label: values.label,
    width_cm: values.widthCm,
    price_cents: values.priceCents,
    display_order: values.displayOrder,
    is_active: values.isActive,
  });

  if (error) {
    console.error("Nie udało się dodać rozmiaru:", error);
    return { success: false, message: "Nie udało się dodać rozmiaru." };
  }

  revalidateCatalog();
  return { success: true, message: `Rozmiar „${values.label}” został dodany.` };
}

export async function updateRugSize(
  id: number,
  input: RugSizeInput,
): Promise<CatalogActionResult> {
  if (!isPositiveId(id)) {
    return { success: false, message: "Nieprawidłowy rozmiar." };
  }

  const parsed = rugSizeSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, message: firstIssueMessage(parsed.error) };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const values = parsed.data;
  const { error } = await supabase
    .from("rug_sizes")
    .update({
      label: values.label,
      width_cm: values.widthCm,
      price_cents: values.priceCents,
      display_order: values.displayOrder,
      is_active: values.isActive,
    })
    .eq("id", id);

  if (error) {
    console.error("Nie udało się zapisać rozmiaru:", error);
    return { success: false, message: "Nie udało się zapisać rozmiaru." };
  }

  revalidateCatalog();
  return { success: true, message: "Rozmiar został zapisany." };
}

export async function deleteRugSize(id: number): Promise<CatalogActionResult> {
  if (!isPositiveId(id)) {
    return { success: false, message: "Nieprawidłowy rozmiar." };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const usage = await countBookingsReferencing(supabase, "rug_size_id", [id]);

  if (usage == null) {
    return { success: false, message: "Nie udało się usunąć rozmiaru." };
  }

  if (usage > 0) {
    return { success: false, message: blockedByBookingsMessage("Ten rozmiar") };
  }

  const { error } = await supabase.from("rug_sizes").delete().eq("id", id);

  if (error) {
    console.error("Nie udało się usunąć rozmiaru:", error);
    return { success: false, message: "Nie udało się usunąć rozmiaru." };
  }

  revalidateCatalog();
  return { success: true, message: "Rozmiar został usunięty." };
}

/* ----------------------------------------------------------------- photos */

export type RugPhotoOwner = {
  rugTypeId: number | null;
  rugVariantId: number | null;
};

export async function uploadRugPhoto(
  owner: RugPhotoOwner,
  file: File,
  makeCover: boolean,
): Promise<CatalogActionResult> {
  const ownsType = isPositiveId(owner.rugTypeId);
  const ownsVariant = isPositiveId(owner.rugVariantId);

  if (ownsType === ownsVariant) {
    return {
      success: false,
      message: "Zdjęcie musi należeć do kategorii albo do podrodzaju.",
    };
  }

  const ownerColumn = ownsType ? "rug_type_id" : "rug_variant_id";
  const ownerId = ownsType ? owner.rugTypeId : owner.rugVariantId;

  const validation = await validateImageUpload(file, MAX_RUG_PHOTO_SIZE);

  if (!validation.ok) {
    return { success: false, message: validation.message };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const { data: existingPhotos, error: existingError } = await supabase
    .from("rug_photos")
    .select("id, display_order, is_cover")
    .eq(ownerColumn, ownerId);

  if (existingError) {
    console.error("Nie udało się pobrać zdjęć właściciela:", existingError);
    return {
      success: false,
      message: isMissingRugPhotosTable(existingError)
        ? MISSING_PHOTOS_TABLE_MESSAGE
        : "Nie udało się pobrać zdjęć kategorii.",
    };
  }

  const photos = existingPhotos ?? [];
  // The very first photo of a category becomes its cover on its own — a
  // category with realizations but no card cover is never what anyone wants.
  const shouldBeCover = makeCover || photos.length === 0;
  const nextOrder = photos.length
    ? Math.max(...photos.map((photo) => Number(photo.display_order ?? 0))) + 1
    : 0;

  const { buffer, extension, contentType } = validation.image;
  const storagePrefix = ownsType ? String(ownerId) : `variants/${ownerId}`;
  const storagePath = `${storagePrefix}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(RUG_CATALOG_PHOTOS_BUCKET)
    .upload(storagePath, buffer, {
      cacheControl: "31536000",
      contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error("Nie udało się przesłać zdjęcia kategorii:", uploadError);
    return {
      success: false,
      message: `Nie udało się przesłać zdjęcia. Sprawdź, czy istnieje bucket „${RUG_CATALOG_PHOTOS_BUCKET}”.`,
    };
  }

  if (shouldBeCover && photos.some((photo) => photo.is_cover)) {
    const { error: unsetError } = await supabase
      .from("rug_photos")
      .update({ is_cover: false })
      .eq(ownerColumn, ownerId);

    if (unsetError) {
      console.error("Nie udało się zmienić okładki:", unsetError);
      await supabase.storage.from(RUG_CATALOG_PHOTOS_BUCKET).remove([storagePath]);
      return { success: false, message: "Nie udało się ustawić okładki." };
    }
  }

  const { error: insertError } = await supabase.from("rug_photos").insert({
    rug_type_id: ownsType ? ownerId : null,
    rug_variant_id: ownsVariant ? ownerId : null,
    storage_path: storagePath,
    is_cover: shouldBeCover,
    display_order: nextOrder,
  });

  if (insertError) {
    console.error("Nie udało się zapisać zdjęcia:", insertError);
    // Nothing points at the uploaded object now, so drop it rather than leave
    // an invisible file billing storage forever.
    await supabase.storage.from(RUG_CATALOG_PHOTOS_BUCKET).remove([storagePath]);
    return { success: false, message: "Nie udało się zapisać zdjęcia." };
  }

  revalidateCatalog();
  return {
    success: true,
    message: shouldBeCover ? "Okładka została dodana." : "Zdjęcie zostało dodane.",
  };
}

export async function setRugPhotoCover(
  photoId: number,
): Promise<CatalogActionResult> {
  if (!isPositiveId(photoId)) {
    return { success: false, message: "Nieprawidłowe zdjęcie." };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const { data: photo, error: photoError } = await supabase
    .from("rug_photos")
    .select("id, rug_type_id, rug_variant_id")
    .eq("id", photoId)
    .maybeSingle();

  if (photoError || !photo) {
    console.error("Nie udało się pobrać zdjęcia:", photoError);
    return {
      success: false,
      message: isMissingRugPhotosTable(photoError)
        ? MISSING_PHOTOS_TABLE_MESSAGE
        : "Nie udało się znaleźć zdjęcia.",
    };
  }

  const ownsType = isPositiveId(photo.rug_type_id);
  const ownerColumn = ownsType ? "rug_type_id" : "rug_variant_id";
  const ownerId = ownsType ? photo.rug_type_id : photo.rug_variant_id;

  // Clear first: a unique partial index allows only one cover per owner.
  const { error: unsetError } = await supabase
    .from("rug_photos")
    .update({ is_cover: false })
    .eq(ownerColumn, ownerId);

  if (unsetError) {
    console.error("Nie udało się zdjąć poprzedniej okładki:", unsetError);
    return { success: false, message: "Nie udało się ustawić okładki." };
  }

  const { error } = await supabase
    .from("rug_photos")
    .update({ is_cover: true })
    .eq("id", photoId);

  if (error) {
    console.error("Nie udało się ustawić okładki:", error);
    return { success: false, message: "Nie udało się ustawić okładki." };
  }

  revalidateCatalog();
  return { success: true, message: "Okładka została zmieniona." };
}

export async function deleteRugPhoto(
  photoId: number,
): Promise<CatalogActionResult> {
  if (!isPositiveId(photoId)) {
    return { success: false, message: "Nieprawidłowe zdjęcie." };
  }

  const supabase = await getAdminClient();
  if (!supabase) return SESSION_EXPIRED;

  const { data: photo, error: photoError } = await supabase
    .from("rug_photos")
    .select("id, rug_type_id, rug_variant_id, storage_path, is_cover")
    .eq("id", photoId)
    .maybeSingle();

  if (photoError || !photo) {
    console.error("Nie udało się pobrać zdjęcia:", photoError);
    return {
      success: false,
      message: isMissingRugPhotosTable(photoError)
        ? MISSING_PHOTOS_TABLE_MESSAGE
        : "Nie udało się znaleźć zdjęcia.",
    };
  }

  const { error } = await supabase.from("rug_photos").delete().eq("id", photoId);

  if (error) {
    console.error("Nie udało się usunąć zdjęcia:", error);
    return { success: false, message: "Nie udało się usunąć zdjęcia." };
  }

  const { error: storageError } = await supabase.storage
    .from(RUG_CATALOG_PHOTOS_BUCKET)
    .remove([photo.storage_path]);

  if (storageError) {
    // The row is gone, so the photo is off the site either way; a leftover
    // object is worth a log, not an error the owner has to act on.
    console.error("Nie udało się usunąć pliku zdjęcia:", storageError);
  }

  const ownsType = isPositiveId(photo.rug_type_id);
  const ownerColumn = ownsType ? "rug_type_id" : "rug_variant_id";
  const ownerId = ownsType ? photo.rug_type_id : photo.rug_variant_id;

  // Deleting the cover would leave the owner card blank, so the next photo in
  // order takes over.
  if (photo.is_cover) {
    const { data: replacement } = await supabase
      .from("rug_photos")
      .select("id")
      .eq(ownerColumn, ownerId)
      .order("display_order")
      .limit(1)
      .maybeSingle();

    if (replacement) {
      await supabase
        .from("rug_photos")
        .update({ is_cover: true })
        .eq("id", replacement.id);
    }
  }

  revalidateCatalog();
  return { success: true, message: "Zdjęcie zostało usunięte." };
}
