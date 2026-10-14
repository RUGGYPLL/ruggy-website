"use client";
import {
  formatLocalDateKey,
  getMinimumBookingDateKey,
} from "@/lib/booking-date";
import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DateLib, DayPicker } from "react-day-picker";
import { pl } from "react-day-picker/locale";
import "react-day-picker/dist/style.css";
import type { Booking } from "./page";
import type { Dispatch, SetStateAction } from "react";
import { FieldError, fieldErrorId, type FieldErrors } from "./field-error";

type DatePickerProps = {
  setBooking: Dispatch<SetStateAction<Booking>>;
  blockedDates: Date[];
  bookingLeadDays: number;
  fieldErrors?: FieldErrors;
};

const css = `
  .order-calendar {
    --rdp-accent-color: var(--ruggy-blue);
    --rdp-today-color: var(--ruggy-blue);
    margin: 0;
  }

  .order-calendar .rdp-months {
    max-width: 100%;
  }

  .order-calendar .rdp-month {
    width: 100%;
  }

  .order-calendar .rdp-month_grid {
    width: 100%;
  }

  .order-calendar .rdp-caption_label {
    font-size: 0.95rem;
    font-weight: 650;
  }

  .order-calendar .rdp-weekday {
    color: var(--ruggy-muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .order-calendar .rdp-day_button {
    border-radius: 0.375rem;
  }

  .order-calendar .rdp-selected .rdp-day_button {
    background: var(--ruggy-blue);
    border-color: var(--ruggy-blue);
    color: white;
  }

  .order-calendar .my-disabled .rdp-day_button,
  .order-calendar .rdp-disabled .rdp-day_button {
    color: var(--ruggy-muted);
    text-decoration: line-through;
  }
`;

// Polish month and weekday names come out of the locale in lower case, which
// reads as a typo in a heading-sized caption.
const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

export const DatePicker = ({
  setBooking,
  blockedDates,
  bookingLeadDays,
  fieldErrors = {},
}: DatePickerProps) => {
  const [selected, setSelected] = useState<Date | undefined>();
  const minimumBookingDate = useMemo(() => {
    const [year, month, day] = getMinimumBookingDateKey(
      new Date(),
      bookingLeadDays,
    )
      .split("-")
      .map(Number);
    return new Date(year, month - 1, day);
  }, [bookingLeadDays]);

  // The first day that is both past the lead time and not blocked. Whole months
  // can be taken, so without this the calendar would open on a month where
  // every day is crossed out and the visitor has to page forward by hand.
  const firstAvailableDate = useMemo(() => {
    const blockedKeys = new Set(blockedDates.map(formatLocalDateKey));
    const candidate = new Date(minimumBookingDate);

    for (let dayOffset = 0; dayOffset < 366; dayOffset += 1) {
      if (!blockedKeys.has(formatLocalDateKey(candidate))) {
        return candidate;
      }
      candidate.setDate(candidate.getDate() + 1);
    }

    return minimumBookingDate;
  }, [blockedDates, minimumBookingDate]);

  // Blocked dates arrive from Supabase after the first render, so `defaultMonth`
  // would be stale by the time we know which month is open. Drive the month
  // instead, and only re-snap when the target month itself changes — that way a
  // visitor who has already paged around is never yanked back.
  const firstAvailableMonthKey = `${firstAvailableDate.getFullYear()}-${firstAvailableDate.getMonth()}`;
  const [visibleMonth, setVisibleMonth] = useState(firstAvailableDate);
  const [snappedMonthKey, setSnappedMonthKey] = useState(firstAvailableMonthKey);

  if (snappedMonthKey !== firstAvailableMonthKey) {
    setSnappedMonthKey(firstAvailableMonthKey);
    setVisibleMonth(firstAvailableDate);
  }

  useEffect(() => {
    setBooking((prev) => ({ ...prev, pickupDate: selected ?? null }));
  }, [selected, setBooking]);

  return (
    <section className="space-y-5" aria-labelledby="date-picker-title">
      <style>{css}</style>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ruggy-blue-soft)] text-[var(--ruggy-blue)]">
          <CalendarDays className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3
            id="date-picker-title"
            className="text-lg font-black text-[var(--ruggy-ink)]"
          >
            Termin realizacji
          </h3>
          <p className="mt-1 max-w-md text-sm leading-6 text-[var(--ruggy-body)]">
            To dzień, w którym zaczynam pracę nad Twoim dywanem. Zajęte oraz
            zbyt bliskie terminy są wyszarzone i przekreślone.
          </p>
        </div>
      </div>

      <div
        data-field="pickupDate"
        tabIndex={-1}
        aria-invalid={fieldErrors.pickupDate ? true : undefined}
        aria-describedby={
          fieldErrors.pickupDate ? fieldErrorId("pickupDate") : undefined
        }
        className={`rounded-2xl border-2 bg-[var(--ruggy-surface)] p-3 outline-none sm:p-4 ${
          fieldErrors.pickupDate
            ? "border-[var(--ruggy-error)]"
            : "border-[var(--ruggy-border-strong)]"
        }`}
      >
        <DayPicker
          className="order-calendar"
          locale={pl}
          formatters={{
            formatCaption: (month, options, dateLib) =>
              capitalize(
                (dateLib ?? new DateLib(options)).formatMonthYear(month),
              ),
            formatWeekdayName: (weekday, options, dateLib) =>
              capitalize(
                (dateLib ?? new DateLib(options)).format(weekday, "cccccc"),
              ),
          }}
          labels={{
            labelPrevious: () => "Poprzedni miesiąc",
            labelNext: () => "Następny miesiąc",
            labelDayButton: (date, modifiers, options, dateLib) => {
              let label = capitalize(
                (dateLib ?? new DateLib(options)).format(date, "PPPP"),
              );
              if (modifiers.today) label = `Dzisiaj, ${label}`;
              if (modifiers.selected) label = `${label}, wybrany`;
              return label;
            },
          }}
          disabled={[{ before: minimumBookingDate }, ...blockedDates]}
          mode="single"
          month={visibleMonth}
          onMonthChange={setVisibleMonth}
          startMonth={firstAvailableDate}
          onSelect={setSelected}
          selected={selected}
          modifiersClassNames={{
            disabled: "my-disabled",
          }}
        />
      </div>
      <FieldError
        id={fieldErrorId("pickupDate")}
        message={fieldErrors.pickupDate}
      />
    </section>
  );
};
