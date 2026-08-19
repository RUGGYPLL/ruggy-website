import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/auth/server-admin";
import { getPolandDateKey } from "@/lib/booking-date";
import { redirect } from "next/navigation";
import {
  AI_RUG_PREVIEWS_FOLDER,
  getAiRugPreviewPath,
  REFERENCE_IMAGES_BUCKET,
} from "@/lib/rug-preview-storage";
import AdminShell from "../admin-shell";
import AdminDashboardClient, { type AdminBooking } from "./dashboard-client";

export const maxDuration = 120;

type BookingRow = {
  id: number | string;
  rug_type_id: number | string | null;
  rug_variant_id: number | string | null;
  rug_size_id: number | string | null;
  rug_type_name: string | null;
  rug_variant_name: string | null;
  rug_size_label: string | null;
  price_cents: number | string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  notes: string | null;
  booking_date: string | null;
  status: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  delivery_method: string | null;
  parcel_locker_code: string | null;
  delivery_address: string | null;
  reference_image_path: string | null;
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedBookingValue = Array.isArray(params.booking)
    ? params.booking[0]
    : params.booking;
  const requestedBookingId = Number(requestedBookingValue);
  const user = await getAdminUser();

  if (!user) {
    redirect("/admin/login");
  }

  const supabase = createAdminClient();
  const [
    { data: bookingRows, error: bookingsError },
    { data: blockedRows, error: blockedError },
    { data: aiPreviewFiles, error: aiPreviewsError },
    { data: settingsRow, error: settingsError },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, rug_type_id, rug_variant_id, rug_size_id, rug_type_name, rug_variant_name, rug_size_label, price_cents, customer_name, customer_email, customer_phone, notes, booking_date, status, stripe_session_id, stripe_payment_intent_id, expires_at, created_at, updated_at, delivery_method, parcel_locker_code, delivery_address, reference_image_path",
      )
      .order("created_at", { ascending: false }),
    supabase.from("blocked_dates").select("date").order("date"),
    supabase.storage
      .from(REFERENCE_IMAGES_BUCKET)
      .list(AI_RUG_PREVIEWS_FOLDER, { limit: 1000 }),
    supabase
      .from("site_settings")
      .select("maintenance_mode")
      .eq("id", "global")
      .maybeSingle(),
  ]);

  const aiPreviewFileNames = new Set(
    aiPreviewFiles?.map((file) => file.name) ?? [],
  );

  const bookings =
    (bookingRows as BookingRow[] | null)?.map((booking) => ({
      id: Number(booking.id),
      rugTypeId:
        booking.rug_type_id == null ? null : Number(booking.rug_type_id),
      rugVariantId:
        booking.rug_variant_id == null ? null : Number(booking.rug_variant_id),
      rugSizeId:
        booking.rug_size_id == null ? null : Number(booking.rug_size_id),
      rugTypeName: booking.rug_type_name,
      rugVariantName: booking.rug_variant_name,
      rugSizeLabel: booking.rug_size_label,
      priceCents:
        booking.price_cents == null ? null : Number(booking.price_cents),
      customerName: booking.customer_name,
      customerEmail: booking.customer_email,
      customerPhone: booking.customer_phone,
      notes: booking.notes,
      bookingDate: booking.booking_date,
      status: booking.status ?? "paid",
      stripeSessionId: booking.stripe_session_id,
      stripePaymentIntentId: booking.stripe_payment_intent_id,
      expiresAt: booking.expires_at,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
      deliveryMethod: booking.delivery_method,
      parcelLockerCode: booking.parcel_locker_code,
      deliveryAddress: booking.delivery_address,
      referenceImagePath: booking.reference_image_path,
      referenceImageUrl: null as string | null,
      aiPreviewUrl: null as string | null,
    })) ?? [];

  await Promise.all(
    bookings.map(async (booking) => {
      await Promise.all([
        booking.referenceImagePath
          ? supabase.storage
              .from(REFERENCE_IMAGES_BUCKET)
              .createSignedUrl(booking.referenceImagePath, 60 * 60)
              .then(({ data, error }) => {
                if (!error && data?.signedUrl) {
                  booking.referenceImageUrl = data.signedUrl;
                }
              })
          : Promise.resolve(),
        aiPreviewFileNames.has(`${booking.id}.png`)
          ? supabase.storage
              .from(REFERENCE_IMAGES_BUCKET)
              .createSignedUrl(getAiRugPreviewPath(booking.id), 60 * 60)
              .then(({ data, error }) => {
                if (!error && data?.signedUrl) {
                  booking.aiPreviewUrl = data.signedUrl;
                }
              })
          : Promise.resolve(),
      ]);
    }),
  );

  const blockedDates =
    blockedRows
      ?.map((row) => row.date)
      .filter((date): date is string => Boolean(date)) ?? [];
  const initialSelectedBookingId =
    Number.isInteger(requestedBookingId) &&
    bookings.some((booking) => booking.id === requestedBookingId)
      ? requestedBookingId
      : null;

  return (
    <AdminShell
      userEmail={user.email}
      activeNav="overview"
      title="Panel administracyjny"
      subtitle="Zarządzanie studiem"
    >
      {bookingsError || blockedError || aiPreviewsError || settingsError ? (
        <div className="mb-5 rounded-2xl border-2 border-[var(--ruggy-coral)]/40 bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[var(--ruggy-error)]">
          Nie udało się pobrać wszystkich danych panelu. Sprawdź połączenie z
          Supabase.
        </div>
      ) : null}

      <AdminDashboardClient
        initialBookings={bookings as AdminBooking[]}
        initialBlockedDates={blockedDates}
        initialSelectedBookingId={initialSelectedBookingId}
        todayDateKey={getPolandDateKey()}
        initialMaintenanceMode={settingsRow?.maintenance_mode === true}
      />
    </AdminShell>
  );
}
