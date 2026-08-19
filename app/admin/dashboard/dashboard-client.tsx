"use client";

import {
  addDaysToDateKey,
  BOOKING_LEAD_DAYS,
  getBookingLeadDateKeys,
} from "@/lib/booking-date";
import {
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  LoaderCircle,
  Lock,
  LockOpen,
  Mail,
  MapPin,
  Package,
  Phone,
  Power,
  Search,
  Truck,
  UserRound,
  WandSparkles,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import {
  generateAiRugPreview,
  toggleBlockedDate,
  toggleMaintenanceMode,
  updateBookingStatus,
} from "./actions";

export type AdminBooking = {
  id: number;
  rugTypeId: number | null;
  rugVariantId: number | null;
  rugSizeId: number | null;
  rugTypeName: string | null;
  rugVariantName: string | null;
  rugSizeLabel: string | null;
  priceCents: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  bookingDate: string | null;
  status: string;
  stripeSessionId: string | null;
  stripePaymentIntentId: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deliveryMethod: string | null;
  parcelLockerCode: string | null;
  deliveryAddress: string | null;
  referenceImagePath: string | null;
  referenceImageUrl: string | null;
  aiPreviewUrl: string | null;
};

type BookingStatus =
  | "awaiting_quote"
  | "paid"
  | "in_progress"
  | "completed"
  | "cancelled";
type StatusFilter = "all" | BookingStatus;

const statusOptions: Array<{ value: BookingStatus; label: string }> = [
  { value: "awaiting_quote", label: "Do wyceny" },
  { value: "paid", label: "Opłacone" },
  { value: "in_progress", label: "W realizacji" },
  { value: "completed", label: "Zakończone" },
  { value: "cancelled", label: "Anulowane" },
];

const statusLabels: Record<string, string> = Object.fromEntries(
  statusOptions.map((option) => [option.value, option.label]),
);

const statusClasses: Record<string, string> = {
  awaiting_quote: "bg-[#f7e8ff] text-[#7a3691]",
  paid: "bg-[#fff1bf] text-[#8a6411]",
  in_progress: "bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]",
  completed: "bg-[#e1f1e8] text-[var(--ruggy-success)]",
  cancelled: "bg-[#ece9e2] text-[var(--ruggy-muted)]",
};

const formatDate = (value: string | null) => {
  if (!value) return "Brak terminu";

  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
};

const formatShortDate = (value: string | null) => {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
};

const formatDateTime = (value: string | null) => {
  if (!value) return "Brak danych";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatPrice = (priceCents: number | null) => {
  if (priceCents == null) return "Brak ceny";

  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(priceCents / 100);
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const getStatusLabel = (status: string) => statusLabels[status] ?? status;

const getDeliveryLabel = (method: string | null) => {
  if (method === "parcel_locker") return "Paczkomat InPost";
  if (method === "courier") return "Kurier";
  return "Brak danych";
};

const getRugDetails = (booking: AdminBooking) =>
  [
    booking.rugTypeName || "Dywan",
    booking.rugVariantName,
    booking.rugSizeLabel || "Brak rozmiaru",
  ]
    .filter(Boolean)
    .join(" · ");

export default function AdminDashboardClient({
  initialBookings,
  initialBlockedDates,
  initialSelectedBookingId,
  todayDateKey,
  initialMaintenanceMode,
}: {
  initialBookings: AdminBooking[];
  initialBlockedDates: string[];
  initialSelectedBookingId: number | null;
  todayDateKey: string;
  initialMaintenanceMode: boolean;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [blockedDates, setBlockedDates] = useState(initialBlockedDates);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(
    initialSelectedBookingId,
  );
  const [maintenanceMode, setMaintenanceMode] = useState(
    initialMaintenanceMode,
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [actionMessage, setActionMessage] = useState<string>();
  const [generatingBookingId, setGeneratingBookingId] = useState<number | null>(
    null,
  );
  const [hoveredCalendarDate, setHoveredCalendarDate] = useState<string | null>(
    null,
  );
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(todayDateKey);
  const calendarHoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const selectedBooking =
    bookings.find((booking) => booking.id === selectedBookingId) ?? null;

  useEffect(() => {
    if (!selectedBooking) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedBookingId(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedBooking]);

  useEffect(() => {
    return () => {
      if (calendarHoverTimeout.current) {
        clearTimeout(calendarHoverTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!actionMessage) return;

    const timeout = window.setTimeout(() => {
      setActionMessage(undefined);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [actionMessage]);

  const filteredBookings = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pl-PL");

    return bookings.filter((booking) => {
      const matchesStatus =
        statusFilter === "all" || booking.status === statusFilter;
      const searchableText = [
        booking.customerName,
        booking.customerEmail,
        booking.rugTypeName,
        booking.rugVariantName,
        booking.rugSizeLabel,
        String(booking.id),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pl-PL");

      return matchesStatus && searchableText.includes(normalizedSearch);
    });
  }, [bookings, search, statusFilter]);

  const stats = useMemo(
    () => ({
      total: bookings.length,
      active: bookings.filter((booking) =>
        ["awaiting_quote", "paid", "in_progress"].includes(booking.status),
      ).length,
      completed: bookings.filter((booking) => booking.status === "completed")
        .length,
      revenue: bookings
        .filter((booking) =>
          ["paid", "in_progress", "completed"].includes(booking.status),
        )
        .reduce((total, booking) => total + (booking.priceCents ?? 0), 0),
    }),
    [bookings],
  );

  const statusCounts = useMemo(
    () => ({
      all: bookings.length,
      awaiting_quote: bookings.filter(
        (booking) => booking.status === "awaiting_quote",
      ).length,
      paid: bookings.filter((booking) => booking.status === "paid").length,
      in_progress: bookings.filter(
        (booking) => booking.status === "in_progress",
      ).length,
      completed: bookings.filter((booking) => booking.status === "completed")
        .length,
      cancelled: bookings.filter((booking) => booking.status === "cancelled")
        .length,
    }),
    [bookings],
  );

  const bookedDateKeys = useMemo(
    () =>
      Array.from(
        new Set(
          bookings
            .filter(
              (booking) =>
                booking.bookingDate && booking.status !== "cancelled",
            )
            .map((booking) => booking.bookingDate as string),
        ),
      ),
    [bookings],
  );

  const automaticBlockedDateKeys = useMemo(
    () => getBookingLeadDateKeys(todayDateKey),
    [todayDateKey],
  );
  const upcomingRangeEnd = addDaysToDateKey(todayDateKey, BOOKING_LEAD_DAYS - 1);
  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            booking.bookingDate &&
            booking.bookingDate >= todayDateKey &&
            booking.bookingDate <= upcomingRangeEnd,
        )
        .toSorted((first, second) =>
          (first.bookingDate ?? "").localeCompare(second.bookingDate ?? ""),
        ),
    [bookings, todayDateKey, upcomingRangeEnd],
  );
  const activeCalendarDate = hoveredCalendarDate ?? selectedCalendarDate;
  const isAutomaticBlockedDate =
    automaticBlockedDateKeys.includes(activeCalendarDate);
  const isActiveCalendarDateBlocked =
    blockedDates.includes(activeCalendarDate) || isAutomaticBlockedDate;
  const calendarBookings = useMemo(
    () =>
      bookings.filter((booking) => booking.bookingDate === activeCalendarDate),
    [activeCalendarDate, bookings],
  );

  const handleStatusChange = (bookingId: number, status: BookingStatus) => {
    setActionMessage(undefined);

    startTransition(async () => {
      const result = await updateBookingStatus(bookingId, status);

      if (!result.success) {
        setActionMessage(result.message);
        return;
      }

      setBookings((current) =>
        current.map((booking) =>
          booking.id === bookingId ? { ...booking, status } : booking,
        ),
      );
      setActionMessage("Status zamówienia został zaktualizowany.");
    });
  };

  const handleGenerateAiPreview = async (bookingId: number) => {
    setActionMessage(undefined);
    setGeneratingBookingId(bookingId);

    try {
      const result = await generateAiRugPreview(bookingId);

      if (!result.success) {
        setActionMessage(result.message);
        return;
      }

      const previewUrl = result.previewUrl;

      if (!previewUrl) {
        setActionMessage("Projekt został zapisany, ale nie można go wyświetlić.");
        return;
      }

      setBookings((current) =>
        current.map((booking) =>
          booking.id === bookingId
            ? { ...booking, aiPreviewUrl: previewUrl }
            : booking,
        ),
      );
      setActionMessage("Projekt dywanu został wygenerowany.");
    } catch {
      setActionMessage("Połączenie zostało przerwane. Spróbuj ponownie.");
    } finally {
      setGeneratingBookingId(null);
    }
  };

  const handleToggleBlockedDate = (date: Date) => {
    const dateKey = toDateKey(date);
    const shouldBlock = !blockedDates.includes(dateKey);
    setActionMessage(undefined);

    startTransition(async () => {
      const result = await toggleBlockedDate(dateKey, shouldBlock);

      if (!result.success) {
        setActionMessage(result.message);
        return;
      }

      setBlockedDates((current) =>
        shouldBlock
          ? [...current, dateKey].sort()
          : current.filter((blockedDate) => blockedDate !== dateKey),
      );
      setActionMessage(
        shouldBlock ? "Dzień został zablokowany." : "Dzień został odblokowany.",
      );
    });
  };

  const handleToggleMaintenanceMode = () => {
    const nextValue = !maintenanceMode;
    setActionMessage(undefined);

    startTransition(async () => {
      const result = await toggleMaintenanceMode(nextValue);

      if (!result.success) {
        setActionMessage(result.message);
        return;
      }

      setMaintenanceMode(nextValue);
      setActionMessage(
        nextValue
          ? "Przerwa techniczna została włączona."
          : "Strona publiczna została ponownie włączona.",
      );
    });
  };

  const clearCalendarHoverTimeout = () => {
    if (calendarHoverTimeout.current) {
      clearTimeout(calendarHoverTimeout.current);
      calendarHoverTimeout.current = null;
    }
  };

  const handleCalendarMouseEnter = (date: Date) => {
    clearCalendarHoverTimeout();
    setHoveredCalendarDate(toDateKey(date));
  };

  const handleCalendarMouseLeave = () => {
    clearCalendarHoverTimeout();
    calendarHoverTimeout.current = setTimeout(() => {
      setHoveredCalendarDate(null);
      calendarHoverTimeout.current = null;
    }, 220);
  };

  const handleCalendarDayClick = (date: Date) => {
    const dateKey = toDateKey(date);

    clearCalendarHoverTimeout();
    setSelectedCalendarDate(dateKey);
    setHoveredCalendarDate(null);
  };

  const blockedDateObjects = Array.from(
    new Set([...blockedDates, ...automaticBlockedDateKeys]),
  ).map(parseDateKey);
  const bookedDateObjects = bookedDateKeys.map(parseDateKey);

  return (
    <>
      <style>{`
        .admin-calendar {
          --rdp-accent-color: var(--ruggy-blue);
          --rdp-today-color: var(--ruggy-blue);
          width: 100%;
        }
        .admin-calendar .rdp-months,
        .admin-calendar .rdp-month,
        .admin-calendar .rdp-month_grid {
          width: 100%;
          max-width: 100%;
        }
        .admin-calendar .rdp-caption_label {
          color: var(--ruggy-ink);
          font-size: 0.9rem;
          font-weight: 700;
        }
        .admin-calendar .rdp-weekday {
          color: var(--ruggy-muted);
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .admin-calendar .rdp-day_button {
          width: 2.25rem;
          height: 2.25rem;
          border-radius: 0.75rem;
          font-size: 0.8rem;
        }
        .admin-calendar .rdp-today:not(.blocked) .rdp-day_button {
          background: var(--ruggy-yellow);
        }
        .admin-calendar .blocked .rdp-day_button {
          background: var(--ruggy-ink);
          color: white;
        }
        .admin-calendar .booked .rdp-day_button {
          box-shadow: inset 0 0 0 2px var(--ruggy-yellow);
        }
      `}</style>

      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6">
        <section id="overview" className="scroll-mt-28">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ruggy-blue)]">
                Pulpit
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--ruggy-ink)] sm:text-4xl">
                Przegląd studia
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--ruggy-body)]">
                Aktualny stan zamówień i terminów.
              </p>
            </div>
            <p className="text-xs font-semibold text-[var(--ruggy-muted)]">
              Dane aktualne teraz
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Wszystkie zamówienia"
              value={String(stats.total)}
              icon={Package}
            />
            <StatCard
              label="Do realizacji"
              value={String(stats.active)}
              icon={Clock3}
              tone="rose"
            />
            <StatCard
              label="Zakończone"
              value={String(stats.completed)}
              icon={Check}
              tone="green"
            />
            <StatCard
              label="Wartość zamówień"
              value={formatPrice(stats.revenue)}
              icon={CircleDollarSign}
              tone="yellow"
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-ink)] text-white shadow-[5px_5px_0_var(--ruggy-yellow)]">
          <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ruggy-yellow)] text-[var(--ruggy-ink)]">
                <Wrench size={20} aria-hidden="true" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black">Widoczność strony</h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
                      maintenanceMode
                        ? "bg-[var(--ruggy-yellow)] text-[var(--ruggy-ink)]"
                        : "bg-[var(--ruggy-success)] text-white"
                    }`}
                  >
                    {maintenanceMode ? "Przerwa aktywna" : "Strona aktywna"}
                  </span>
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-white/70">
                  {maintenanceMode
                    ? "Odwiedzający widzą stronę przerwy technicznej. Panel administratora nadal działa."
                    : "Włącz przerwę, gdy chcesz spokojnie podłączyć domenę lub wykonać prace na stronie."}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-pressed={maintenanceMode}
              disabled={isPending}
              onClick={handleToggleMaintenanceMode}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-black transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ruggy-yellow)] disabled:cursor-wait disabled:opacity-60 ${
                maintenanceMode
                  ? "bg-white text-[var(--ruggy-ink)]"
                  : "bg-[var(--ruggy-yellow)] text-[var(--ruggy-ink)]"
              }`}
            >
              <Power size={16} aria-hidden="true" />
              {maintenanceMode ? "Włącz stronę" : "Włącz przerwę"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border-2 border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] shadow-[5px_5px_0_var(--ruggy-border)]">
          <div className="flex flex-col justify-between gap-3 border-b-2 border-[var(--ruggy-border)] px-4 py-4 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-[var(--ruggy-ink)]">
                <CalendarDays
                  size={18}
                  className="text-[var(--ruggy-blue)]"
                  aria-hidden="true"
                />
                Zlecenia na najbliższe 5 dni
              </h2>
              <p className="mt-1 text-xs text-[var(--ruggy-muted)]">
                {formatDate(todayDateKey)} – {formatDate(upcomingRangeEnd)}
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full bg-[var(--ruggy-yellow)] px-3 py-1.5 text-xs font-black text-[var(--ruggy-ink)]">
              Liczba zleceń: {upcomingBookings.length}
            </span>
          </div>

          {upcomingBookings.length ? (
            <div className="max-h-72 divide-y divide-[var(--ruggy-border)] overflow-y-auto">
              {upcomingBookings.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => setSelectedBookingId(booking.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#fff8d9] focus-visible:bg-[#fff8d9] focus-visible:outline-none sm:px-6"
                >
                  <BookingAvatar booking={booking} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-[var(--ruggy-ink)]">
                      {booking.customerName || "Klient bez nazwy"}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--ruggy-muted)]">
                      #{booking.id} · {getRugDetails(booking)}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs font-black text-[var(--ruggy-body)] sm:block">
                    {formatShortDate(booking.bookingDate)}
                  </span>
                  <StatusBadge status={booking.status} />
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-[var(--ruggy-muted)]"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-28 items-center justify-center px-4 py-6 text-center text-sm text-[var(--ruggy-muted)]">
              Brak zleceń na najbliższe 5 dni.
            </div>
          )}
        </section>

        <section
          id="orders"
          className="scroll-mt-28 overflow-hidden rounded-[2rem] border-2 border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] shadow-[5px_5px_0_var(--ruggy-border)]"
        >
          <div className="border-b-2 border-[var(--ruggy-border)] px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight text-[var(--ruggy-ink)]">
                  Historia zamówień
                </h2>
                <p className="mt-1 text-xs text-[var(--ruggy-muted)]">
                  {filteredBookings.length} z {bookings.length} rekordów
                </p>
              </div>

              <label className="relative block w-full xl:w-72">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ruggy-muted)]"
                  aria-hidden="true"
                />
                <span className="sr-only">Szukaj zamówień</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Szukaj klienta, e-maila lub ID"
                  className="h-11 w-full rounded-xl border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-canvas)] pl-9 pr-3 text-sm text-[var(--ruggy-ink)] outline-none transition-colors placeholder:text-[var(--ruggy-muted)] focus:border-[var(--ruggy-blue)] focus:ring-2 focus:ring-[var(--ruggy-blue)]/15"
                />
              </label>
            </div>

            <div className="mt-5 flex gap-1 overflow-x-auto border-b-2 border-[var(--ruggy-border)]">
              <FilterTab
                active={statusFilter === "all"}
                label="Wszystkie"
                count={statusCounts.all}
                onClick={() => setStatusFilter("all")}
              />
              {statusOptions.map((option) => (
                <FilterTab
                  key={option.value}
                  active={statusFilter === option.value}
                  label={option.label}
                  count={statusCounts[option.value]}
                  onClick={() => setStatusFilter(option.value)}
                />
              ))}
            </div>
          </div>

          {filteredBookings.length ? (
            <>
              <div className="hidden xl:block">
                <div className="grid min-w-[900px] grid-cols-[72px_minmax(220px,1.5fr)_120px_140px_120px_110px_28px] items-center gap-3 border-b-2 border-[var(--ruggy-border)] bg-[var(--ruggy-blue-soft)] px-5 py-3 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--ruggy-muted)]">
                  <span>ID</span>
                  <span>Klient i projekt</span>
                  <span>Termin</span>
                  <span>Dostawa</span>
                  <span>Status</span>
                  <span className="text-right">Kwota</span>
                  <span />
                </div>
                <div className="max-h-[520px] min-w-[900px] divide-y divide-[var(--ruggy-border)] overflow-y-auto">
                  {filteredBookings.map((booking) => (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() => setSelectedBookingId(booking.id)}
                      className="grid w-full grid-cols-[72px_minmax(220px,1.5fr)_120px_140px_120px_110px_28px] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[#fff8d9] focus-visible:bg-[#fff8d9] focus-visible:outline-none"
                    >
                      <span className="text-xs font-black text-[var(--ruggy-blue)]">
                        #{booking.id}
                      </span>
                      <span className="flex min-w-0 items-center gap-3">
                        <BookingAvatar booking={booking} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-[var(--ruggy-ink)]">
                            {booking.customerName || "Klient bez nazwy"}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[var(--ruggy-muted)]">
                            {getRugDetails(booking)}
                          </span>
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-[var(--ruggy-body)]">
                        {formatShortDate(booking.bookingDate)}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-[var(--ruggy-body)]">
                        <Truck
                          size={14}
                          className="text-[var(--ruggy-muted)]"
                          aria-hidden="true"
                        />
                        {getDeliveryLabel(booking.deliveryMethod)}
                      </span>
                      <StatusBadge status={booking.status} />
                      <span className="text-right text-sm font-black text-[var(--ruggy-ink)]">
                        {formatPrice(booking.priceCents)}
                      </span>
                      <ChevronRight
                        size={16}
                        className="text-[var(--ruggy-muted)]"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-[var(--ruggy-border)] xl:hidden">
                {filteredBookings.map((booking) => (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() => setSelectedBookingId(booking.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#fff8d9]"
                  >
                    <BookingAvatar booking={booking} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-black text-[var(--ruggy-ink)]">
                          {booking.customerName || "Klient bez nazwy"}
                        </span>
                        <StatusBadge status={booking.status} />
                      </span>
                      <span className="mt-1 block truncate text-xs text-[var(--ruggy-muted)]">
                        #{booking.id} · {booking.rugTypeName || "Dywan"}
                        {booking.rugVariantName
                          ? ` · ${booking.rugVariantName}`
                          : ""}{" "}
                        ·{" "}
                        {formatShortDate(booking.bookingDate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-black text-[var(--ruggy-ink)]">
                        {formatPrice(booking.priceCents)}
                      </span>
                      <ChevronRight
                        size={16}
                        className="ml-auto mt-1 text-[var(--ruggy-muted)]"
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={Package}
              title="Brak zamówień"
              description="Nie znaleziono rekordów pasujących do wybranego filtra."
            />
          )}
        </section>

        <section
          id="calendar"
          className="scroll-mt-28 overflow-hidden rounded-[2rem] border-2 border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] shadow-[5px_5px_0_var(--ruggy-border)]"
        >
          <div className="flex flex-col justify-between gap-3 border-b-2 border-[var(--ruggy-border)] px-4 py-5 sm:flex-row sm:items-end sm:px-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-[var(--ruggy-ink)]">
                <CalendarDays
                  size={19}
                  className="text-[var(--ruggy-blue)]"
                  aria-hidden="true"
                />
                Kalendarz realizacji
              </h2>
              <p className="mt-1 text-xs text-[var(--ruggy-muted)]">
                Plan zamówień i dni wolnych
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-semibold text-[var(--ruggy-body)]">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-[var(--ruggy-yellow)]" /> Zamówienie
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-[var(--ruggy-ink)]" /> Dzień
                wolny
              </span>
            </div>
          </div>

          <div className="grid xl:grid-cols-[minmax(430px,1fr)_380px]">
            <div className="p-3 sm:p-6 xl:border-r-2 xl:border-[var(--ruggy-border)]">
              <DayPicker
                className="admin-calendar"
                mode="single"
                selected={parseDateKey(selectedCalendarDate)}
                onDayClick={handleCalendarDayClick}
                onDayMouseEnter={handleCalendarMouseEnter}
                onDayMouseLeave={handleCalendarMouseLeave}
                modifiers={{
                  blocked: blockedDateObjects,
                  booked: bookedDateObjects,
                }}
                modifiersClassNames={{ blocked: "blocked", booked: "booked" }}
              />
            </div>

            <div
              onMouseEnter={clearCalendarHoverTimeout}
              onMouseLeave={handleCalendarMouseLeave}
              className="border-t-2 border-[var(--ruggy-border)] bg-[var(--ruggy-blue-soft)] xl:border-t-0"
            >
              <div className="border-b-2 border-[var(--ruggy-border)] p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ruggy-blue)]">
                      Wybrany dzień
                    </p>
                    <h3 className="mt-1 text-base font-black text-[var(--ruggy-ink)]">
                      {formatDate(activeCalendarDate)}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full bg-[var(--ruggy-yellow)] px-2.5 py-1 text-xs font-black text-[var(--ruggy-ink)]">
                      {calendarBookings.length}
                    </span>
                    <button
                      type="button"
                      disabled={isPending || isAutomaticBlockedDate}
                      onClick={() =>
                        handleToggleBlockedDate(parseDateKey(activeCalendarDate))
                      }
                      className={`inline-flex min-h-10 items-center gap-2 rounded-xl border-2 px-3 text-xs font-black transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                        isActiveCalendarDateBlocked
                          ? "border-[var(--ruggy-ink)] bg-[var(--ruggy-ink)] text-white hover:bg-[var(--ruggy-body)]"
                          : "border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] text-[var(--ruggy-ink)] hover:border-[var(--ruggy-ink)] hover:bg-[var(--ruggy-yellow)]"
                      }`}
                    >
                      {isActiveCalendarDateBlocked ? (
                        isAutomaticBlockedDate ? (
                          <Lock size={15} aria-hidden="true" />
                        ) : (
                          <LockOpen size={15} aria-hidden="true" />
                        )
                      ) : (
                        <Lock size={15} aria-hidden="true" />
                      )}
                      {isAutomaticBlockedDate
                        ? "Blokada 5 dni"
                        : isActiveCalendarDateBlocked
                          ? "Odblokuj dzień"
                          : "Zablokuj dzień"}
                    </button>
                  </div>
                </div>

                <div className="mt-4 h-52 overflow-y-auto rounded-2xl">
                  {calendarBookings.length ? (
                    <div className="min-h-full divide-y divide-[var(--ruggy-border)] overflow-hidden rounded-2xl border-2 border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)]">
                      {calendarBookings.map((booking) => (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={() => setSelectedBookingId(booking.id)}
                          className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[#fff8d9]"
                        >
                          <BookingAvatar booking={booking} small />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-[var(--ruggy-ink)]">
                              {booking.customerName || "Klient bez nazwy"}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-[var(--ruggy-muted)]">
                              #{booking.id} · {booking.rugTypeName || "Dywan"}
                              {booking.rugVariantName
                                ? ` · ${booking.rugVariantName}`
                                : ""}
                            </span>
                          </span>
                          <StatusBadge status={booking.status} />
                          <ChevronRight
                            size={15}
                            className="shrink-0 text-[var(--ruggy-muted)]"
                            aria-hidden="true"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="flex h-full items-center justify-center rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] px-3 py-4 text-center text-sm text-[var(--ruggy-muted)]">
                      Brak zamówień w tym dniu
                    </p>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-[var(--ruggy-ink)]">
                    Dni wolne
                  </p>
                  <span className="text-xs font-semibold text-[var(--ruggy-muted)]">
                    {blockedDates.length}
                  </span>
                </div>
                <div className="mt-3 h-48 overflow-y-auto rounded-2xl">
                  {blockedDates.length ? (
                    <div className="space-y-1.5">
                      {blockedDates.map((date) => (
                        <div
                          key={date}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ruggy-border)] bg-[var(--ruggy-surface)] px-3 py-2"
                        >
                          <span className="text-xs font-semibold text-[var(--ruggy-body)]">
                            {formatDate(date)}
                          </span>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              handleToggleBlockedDate(parseDateKey(date))
                            }
                            className="rounded-full px-2 py-1 text-[11px] font-black text-[var(--ruggy-ink)] hover:bg-[var(--ruggy-yellow)] disabled:opacity-50"
                          >
                            Odblokuj
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="flex h-full items-center justify-center rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] px-3 text-center text-sm text-[var(--ruggy-muted)]">
                      Brak zablokowanych terminów.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {selectedBooking ? (
        <BookingDrawer
          booking={selectedBooking}
          isPending={isPending}
          isGenerating={generatingBookingId === selectedBooking.id}
          onClose={() => setSelectedBookingId(null)}
          onStatusChange={handleStatusChange}
          onGenerateAiPreview={handleGenerateAiPreview}
        />
      ) : null}

      {actionMessage ? (
        <div className="fixed bottom-4 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border-2 border-[var(--ruggy-ink)] bg-[var(--ruggy-ink)] px-4 py-3 text-center text-sm font-semibold text-white shadow-[4px_4px_0_var(--ruggy-yellow)]">
          {actionMessage}
        </div>
      ) : null}
    </>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "neutral" | "rose" | "green" | "yellow";
}) {
  const toneClass = {
    neutral: "bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]",
    rose: "bg-[var(--ruggy-yellow)] text-[var(--ruggy-ink)]",
    green: "bg-[#e1f1e8] text-[var(--ruggy-success)]",
    yellow: "bg-[var(--ruggy-ink)] text-[var(--ruggy-yellow)]",
  }[tone];

  return (
    <div className="rounded-[1.5rem] border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-surface)] p-4 shadow-[3px_3px_0_var(--ruggy-border)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--ruggy-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-[var(--ruggy-ink)]">{value}</p>
        </div>
        <span
          className={`flex size-9 items-center justify-center rounded-md ${toneClass}`}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

function FilterTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs font-semibold transition-colors ${
        active ? "text-[var(--ruggy-ink)]" : "text-[var(--ruggy-muted)] hover:text-[var(--ruggy-ink)]"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? "bg-[var(--ruggy-yellow)]" : "bg-[var(--ruggy-blue-soft)]"}`}
      >
        {count}
      </span>
      {active ? (
        <span className="absolute inset-x-2 bottom-0 h-1 rounded-full bg-[var(--ruggy-yellow)]" />
      ) : null}
    </button>
  );
}

function BookingAvatar({
  booking,
  small = false,
}: {
  booking: AdminBooking;
  small?: boolean;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-blue-soft)] font-black text-[var(--ruggy-blue)] ${small ? "size-8 text-[10px]" : "size-9 text-xs"}`}
    >
      {booking.referenceImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={booking.referenceImageUrl}
          alt=""
          className="size-full object-cover"
        />
      ) : (
        (booking.customerName || `#${booking.id}`).slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-black ${statusClasses[status] ?? "bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-muted)]"}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {getStatusLabel(status)}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]">
        <Icon size={19} aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-black text-[var(--ruggy-ink)]">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-[var(--ruggy-muted)]">{description}</p>
    </div>
  );
}

function BookingDrawer({
  booking,
  isPending,
  isGenerating,
  onClose,
  onStatusChange,
  onGenerateAiPreview,
}: {
  booking: AdminBooking;
  isPending: boolean;
  isGenerating: boolean;
  onClose: () => void;
  onStatusChange: (bookingId: number, status: BookingStatus) => void;
  onGenerateAiPreview: (bookingId: number) => Promise<void>;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--ruggy-ink)]/25 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-drawer-title"
        className="ml-auto flex h-full w-full max-w-[540px] flex-col border-l-2 border-[var(--ruggy-border-strong)] bg-[var(--ruggy-canvas)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b-2 border-[var(--ruggy-border)] px-4 py-5 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ruggy-blue)]">
                Zamówienie #{booking.id}
              </p>
              <StatusBadge status={booking.status} />
            </div>
            <h2
              id="booking-drawer-title"
              className="mt-1.5 truncate text-2xl font-black tracking-tight text-[var(--ruggy-ink)]"
            >
              {booking.customerName || "Klient bez nazwy"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Zamknij szczegóły"
            aria-label="Zamknij szczegóły"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ruggy-border)] text-[var(--ruggy-body)] transition-colors hover:border-[var(--ruggy-ink)] hover:bg-[var(--ruggy-yellow)] hover:text-[var(--ruggy-ink)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
          <div className="sticky top-0 z-10 -mx-4 border-b-2 border-[var(--ruggy-border)] bg-[var(--ruggy-canvas)] px-4 py-3 sm:-mx-6 sm:px-6">
            <label className="flex items-center justify-between gap-4">
              <span className="text-xs font-black text-[var(--ruggy-body)]">
                Status realizacji
              </span>
              <select
                value={
                  statusOptions.some(
                    (option) => option.value === booking.status,
                  )
                    ? booking.status
                    : "paid"
                }
                disabled={isPending}
                onChange={(event) =>
                  onStatusChange(
                    booking.id,
                    event.target.value as BookingStatus,
                  )
                }
                className="h-10 min-w-40 rounded-xl border-2 border-[var(--ruggy-border)] bg-[var(--ruggy-surface)] px-3 text-xs font-black text-[var(--ruggy-ink)] outline-none focus:border-[var(--ruggy-blue)] focus:ring-2 focus:ring-[var(--ruggy-blue)]/15 disabled:opacity-50"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <DetailSection title="Materiały projektu">
            <div className="grid gap-3 sm:grid-cols-2">
              <ProjectImage
                imageUrl={booking.referenceImageUrl}
                title="Zdjęcie klienta"
                alt="Zdjęcie referencyjne klienta"
                emptyLabel="Brak zdjęcia"
                icon={Camera}
              />
              <ProjectImage
                imageUrl={booking.aiPreviewUrl}
                title="Projekt AI"
                alt="Poglądowy projekt dywanu wygenerowany przez AI"
                emptyLabel={isGenerating ? "Generowanie..." : "Brak projektu"}
                icon={isGenerating ? LoaderCircle : WandSparkles}
                spinning={isGenerating}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!booking.referenceImagePath || isGenerating}
                onClick={() => onGenerateAiPreview(booking.id)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--ruggy-blue)] px-4 text-xs font-black text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isGenerating ? (
                  <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
                ) : (
                  <WandSparkles size={16} aria-hidden="true" />
                )}
                {isGenerating
                  ? "Generowanie projektu"
                  : booking.aiPreviewUrl
                    ? "Wygeneruj ponownie"
                    : "Wygeneruj projekt AI"}
              </button>

              {booking.aiPreviewUrl ? (
                <a
                  href={booking.aiPreviewUrl}
                  download={`projekt-dywanu-${booking.id}.png`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] px-4 text-xs font-black text-[var(--ruggy-ink)] transition-colors hover:border-[var(--ruggy-ink)] hover:bg-[var(--ruggy-yellow)]"
                >
                  <Download size={16} aria-hidden="true" />
                  Pobierz projekt
                </a>
              ) : null}
            </div>
          </DetailSection>

          <DetailSection title="Szczegóły zlecenia">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailRow
                icon={Package}
                label="Wariant"
                value={booking.rugTypeName || "Dywan"}
              />
              {booking.rugVariantName ? (
                <DetailRow
                  icon={Package}
                  label="Podrodzaj"
                  value={booking.rugVariantName}
                />
              ) : null}
              <DetailRow
                icon={Package}
                label="Rozmiar"
                value={booking.rugSizeLabel || "Brak danych"}
              />
              <DetailRow
                icon={CalendarDays}
                label="Termin wykonania"
                value={formatDate(booking.bookingDate)}
              />
              <DetailRow
                icon={CircleDollarSign}
                label={
                  booking.status === "awaiting_quote"
                    ? "Cena orientacyjna"
                    : "Kwota"
                }
                value={formatPrice(booking.priceCents)}
              />
            </div>
          </DetailSection>

          <DetailSection title="Dostawa">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailRow
                icon={Truck}
                label="Metoda"
                value={getDeliveryLabel(booking.deliveryMethod)}
              />
              {booking.deliveryMethod === "parcel_locker" ? (
                <DetailRow
                  icon={MapPin}
                  label="Paczkomat InPost"
                  value={booking.parcelLockerCode || "Brak danych"}
                />
              ) : null}
              {booking.deliveryMethod === "courier" ? (
                <DetailRow
                  icon={MapPin}
                  label="Adres kuriera"
                  value={booking.deliveryAddress || "Brak danych"}
                />
              ) : null}
            </div>
          </DetailSection>

          <DetailSection title="Dane klienta">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailRow
                icon={UserRound}
                label="Imię i nazwisko"
                value={booking.customerName || "Brak danych"}
              />
              <DetailRow
                icon={Mail}
                label="E-mail"
                value={booking.customerEmail || "Brak danych"}
                href={
                  booking.customerEmail
                    ? `mailto:${booking.customerEmail}`
                    : undefined
                }
              />
              <DetailRow
                icon={Phone}
                label="Telefon"
                value={booking.customerPhone || "Brak danych"}
                href={
                  booking.customerPhone
                    ? `tel:${booking.customerPhone}`
                    : undefined
                }
              />
            </div>
          </DetailSection>

          <DetailSection title="Uwagi klienta">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--ruggy-body)]">
              {booking.notes || "Brak dodatkowych uwag."}
            </p>
          </DetailSection>

          <DetailSection title="Płatność i system">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailRow
                icon={Clock3}
                label="Utworzono"
                value={formatDateTime(booking.createdAt)}
              />
              <DetailRow
                icon={Clock3}
                label="Ostatnia zmiana"
                value={formatDateTime(booking.updatedAt)}
              />
              <DetailRow
                icon={Clock3}
                label="Wygasa"
                value={formatDateTime(booking.expiresAt)}
              />
              <DetailRow
                icon={CircleDollarSign}
                label="Stripe session ID"
                value={booking.stripeSessionId || "Brak danych"}
                mono
              />
              <DetailRow
                icon={CircleDollarSign}
                label="Payment intent ID"
                value={booking.stripePaymentIntentId || "Brak danych"}
                mono
              />
            </div>
          </DetailSection>
        </div>
      </aside>
    </div>
  );
}

function ProjectImage({
  imageUrl,
  title,
  alt,
  emptyLabel,
  icon: Icon,
  spinning = false,
}: {
  imageUrl: string | null;
  title: string;
  alt: string;
  emptyLabel: string;
  icon: LucideIcon;
  spinning?: boolean;
}) {
  if (!imageUrl) {
    return (
      <div className="flex aspect-square min-h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--ruggy-border-strong)] bg-[var(--ruggy-surface)] p-4 text-center text-[var(--ruggy-muted)]">
        <Icon
          className={spinning ? "animate-spin" : undefined}
          size={22}
          aria-hidden="true"
        />
        <span className="mt-2 text-xs font-black">{emptyLabel}</span>
      </div>
    );
  }

  return (
    <a
      href={imageUrl}
      target="_blank"
      rel="noreferrer"
      className="group overflow-hidden rounded-2xl border-2 border-[var(--ruggy-border-strong)] bg-[var(--ruggy-blue-soft)] transition-colors hover:border-[var(--ruggy-ink)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={alt} className="aspect-square w-full object-contain" />
      <span className="flex min-h-10 items-center gap-2 border-t-2 border-[var(--ruggy-border)] bg-[var(--ruggy-surface)] px-3 text-xs font-black text-[var(--ruggy-ink)]">
        <Icon size={14} aria-hidden="true" />
        {title}
      </span>
    </a>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-5 border-t-2 border-[var(--ruggy-border)] pt-5">
      <h3 className="mb-4 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ruggy-blue)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  href,
  mono = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
}) {
  const content = (
    <>
      <p className="text-[11px] font-semibold text-[var(--ruggy-muted)]">{label}</p>
      <p
        className={`mt-1 break-words text-sm font-black leading-5 text-[var(--ruggy-ink)] ${mono ? "font-mono text-[11px]" : ""}`}
      >
        {value}
      </p>
    </>
  );

  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]">
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {href ? (
          <a href={href} className="block hover:text-[var(--ruggy-blue)]">
            {content}
          </a>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
