// ==========================================================
// LegalSetu — Rights Clock: calendar-date arithmetic
// ----------------------------------------------------------
// Custody law counts calendar DAYS, not hours, and a date shown
// to a family must never shift by one because the server runs
// in UTC and the user in IST. So all arithmetic here works on
// plain "YYYY-MM-DD" strings through UTC midnight, never local
// time.
// ==========================================================

export type ISODate = string; // "YYYY-MM-DD"

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUTC(date: ISODate): number {
  if (!isISODate(date)) throw new Error(`Invalid date: ${date}`);
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY_MS);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/**
 * Calendar-month addition that clamps to the end of the month
 * (31 Jan + 1 month = 28/29 Feb), matching how a sentence of
 * "one month" is ordinarily read — never overflowing into March.
 */
export function addMonths(date: ISODate, months: number): ISODate {
  const whole = Math.trunc(months);
  const [y, m, d] = date.split("-").map(Number);
  const targetMonthIndex = m - 1 + whole;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const base = fromUTC(Date.UTC(ty, tm, Math.min(d, lastDay)));
  // Fractional months (from day- or hour-based terms) are added as days.
  const fraction = months - whole;
  return fraction ? addDays(base, Math.round(fraction * 30)) : base;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

/** Today's date in India (IST, UTC+5:30), which is the jurisdiction every deadline belongs to. */
export function todayInIndia(now: Date = new Date()): ISODate {
  return fromUTC(now.getTime() + 330 * 60_000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-05" → "5 Mar 2026" — unambiguous across locales (no 03/05 confusion). */
export function formatDate(date: ISODate): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** 18 → "1 year 6 months", 0.25 → "8 days". */
export function formatMonths(months: number): string {
  if (months < 1) {
    const days = Math.round(months * 30);
    if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
    const hours = Math.round(months * 30 * 24);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  const parts: string[] = [];
  if (y) parts.push(`${y} year${y === 1 ? "" : "s"}`);
  if (m) parts.push(`${m} month${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}
