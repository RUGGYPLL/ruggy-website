"use server";

import { getAuthorizedAdminClient } from "@/lib/auth/server-admin";
import { createRugDesign } from "@/lib/openai-rug-design";
import {
  getAiRugPreviewPath,
  REFERENCE_IMAGES_BUCKET,
} from "@/lib/rug-preview-storage";
import { revalidatePath } from "next/cache";

const allowedStatuses = [
  "awaiting_quote",
  "paid",
  "in_progress",
  "completed",
  "cancelled",
] as const;
type BookingStatus = (typeof allowedStatuses)[number];

const getAdminClient = getAuthorizedAdminClient;

export async function updateBookingStatus(
  bookingId: number,
  status: BookingStatus,
) {
  if (!Number.isInteger(bookingId) || !allowedStatuses.includes(status)) {
    return { success: false, message: "Nieprawidłowe dane statusu." };
  }

  const supabase = await getAdminClient();

  if (!supabase) {
    return { success: false, message: "Sesja administratora wygasła." };
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", bookingId);

  if (error) {
    console.error("Nie udało się zmienić statusu zamówienia:", error);
    return { success: false, message: "Nie udało się zmienić statusu." };
  }

  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function toggleBlockedDate(date: string, shouldBlock: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, message: "Nieprawidłowa data." };
  }

  const supabase = await getAdminClient();

  if (!supabase) {
    return { success: false, message: "Sesja administratora wygasła." };
  }

  if (shouldBlock) {
    const { data: existingDate, error: existingError } = await supabase
      .from("blocked_dates")
      .select("date")
      .eq("date", date)
      .maybeSingle();

    if (existingError) {
      return { success: false, message: "Nie udało się sprawdzić terminu." };
    }

    if (!existingDate) {
      const { error } = await supabase.from("blocked_dates").insert({ date });

      if (error) {
        console.error("Nie udało się zablokować dnia:", error);
        return { success: false, message: "Nie udało się zablokować dnia." };
      }
    }
  } else {
    const { error } = await supabase
      .from("blocked_dates")
      .delete()
      .eq("date", date);

    if (error) {
      console.error("Nie udało się odblokować dnia:", error);
      return { success: false, message: "Nie udało się odblokować dnia." };
    }
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/zamow/[id]", "page");
  return { success: true };
}

export async function toggleMaintenanceMode(shouldEnable: boolean) {
  if (typeof shouldEnable !== "boolean") {
    return { success: false, message: "Nieprawidłowy stan trybu przerwy." };
  }

  const supabase = await getAdminClient();

  if (!supabase) {
    return { success: false, message: "Sesja administratora wygasła." };
  }

  const { error } = await supabase
    .from("site_settings")
    .upsert(
      {
        id: "global",
        maintenance_mode: shouldEnable,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    console.error("Nie udało się zmienić trybu przerwy technicznej:", error);
    return {
      success: false,
      message: "Nie udało się zmienić trybu przerwy technicznej.",
    };
  }

  revalidatePath("/admin/dashboard");
  return { success: true };
}

export async function generateAiRugPreview(bookingId: number) {
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return { success: false, message: "Nieprawidłowy numer zamówienia." };
  }

  const supabase = await getAdminClient();

  if (!supabase) {
    return { success: false, message: "Sesja administratora wygasła." };
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("reference_image_path")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error(
      "Nie udało się pobrać zamówienia do projektu AI:",
      bookingError,
    );
    return { success: false, message: "Nie udało się pobrać zamówienia." };
  }

  if (!booking?.reference_image_path) {
    return {
      success: false,
      message: "To zamówienie nie ma zdjęcia referencyjnego.",
    };
  }

  const { data: referenceImage, error: downloadError } = await supabase.storage
    .from(REFERENCE_IMAGES_BUCKET)
    .download(booking.reference_image_path);

  if (downloadError || !referenceImage) {
    console.error(
      "Nie udało się pobrać zdjęcia referencyjnego:",
      downloadError,
    );
    return {
      success: false,
      message: "Nie udało się pobrać zdjęcia referencyjnego.",
    };
  }

  try {
    const generatedImage = await createRugDesign(
      referenceImage,
      booking.reference_image_path,
    );
    const previewPath = getAiRugPreviewPath(bookingId);
    const { error: uploadError } = await supabase.storage
      .from(REFERENCE_IMAGES_BUCKET)
      .upload(previewPath, generatedImage, {
        contentType: "image/png",
        cacheControl: "0",
        upsert: true,
      });

    if (uploadError) {
      console.error("Nie udało się zapisać projektu AI:", uploadError);
      return { success: false, message: "Nie udało się zapisać projektu AI." };
    }

    const { data: signedPreview, error: signedUrlError } =
      await supabase.storage
        .from(REFERENCE_IMAGES_BUCKET)
        .createSignedUrl(previewPath, 60 * 60);

    if (signedUrlError || !signedPreview?.signedUrl) {
      console.error(
        "Nie udało się utworzyć adresu projektu AI:",
        signedUrlError,
      );
      return {
        success: false,
        message: "Projekt zapisano, ale nie udało się go teraz wyświetlić.",
      };
    }

    revalidatePath("/admin/dashboard");

    return {
      success: true,
      previewUrl: `${signedPreview.signedUrl}&v=${Date.now()}`,
    };
  } catch (error) {
    console.error("Nie udało się wygenerować projektu dywanu:", error);
    return {
      success: false,
      message:
        "Nie udało się wygenerować projektu. Sprawdź klucz OpenAI i spróbuj ponownie.",
    };
  }
}
