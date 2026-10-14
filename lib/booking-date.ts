const POLAND_TIME_ZONE = "Europe/Warsaw";

export const DEFAULT_BOOKING_LEAD_DAYS = 5;
export const BOOKING_LEAD_DAYS = DEFAULT_BOOKING_LEAD_DAYS;
export const MIN_BOOKING_LEAD_DAYS = 1;
export const MAX_BOOKING_LEAD_DAYS = 30;

export const normalizeBookingLeadDays = (value: unknown) => {
  const days = typeof value === "number" ? value : Number(value);

  return Number.isInteger(days) &&
    days >= MIN_BOOKING_LEAD_DAYS &&
    days <= MAX_BOOKING_LEAD_DAYS
    ? days
    : DEFAULT_BOOKING_LEAD_DAYS;
};

export const formatLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const isValidDateKey = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
};

export const getPolandDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: POLAND_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
};

export const addDaysToDateKey = (dateKey: string, days: number) => {
  if (!isValidDateKey(dateKey) || !Number.isInteger(days)) {
    throw new Error("Nieprawidłowa data lub liczba dni.");
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));

  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, "0"),
    String(result.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

export const getMinimumBookingDateKey = (
  date = new Date(),
  leadDays = DEFAULT_BOOKING_LEAD_DAYS,
) => addDaysToDateKey(getPolandDateKey(date), normalizeBookingLeadDays(leadDays));

export const getBookingLeadDateKeys = (
  todayDateKey: string,
  leadDays = DEFAULT_BOOKING_LEAD_DAYS,
) =>
  Array.from({ length: normalizeBookingLeadDays(leadDays) }, (_, index) =>
    addDaysToDateKey(todayDateKey, index),
  );
