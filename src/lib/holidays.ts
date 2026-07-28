/**
 * Kenyan public holidays, and what they do to the day you are actually paid.
 *
 * WHY THIS EXISTS
 * ---------------
 * A coupon date is a schedule, not a payment. Kenyan government bonds pay in
 * exact 182-day steps from issue, so a coupon lands on whatever weekday the
 * arithmetic produces — and roughly two in seven land on a weekend, plus a
 * handful each year on a public holiday. The money arrives on the next
 * business day.
 *
 * The planners quote the scheduled date. For somebody timing a school fee
 * against a coupon, "20 October" and "21 October" are not the same answer, and
 * Mashujaa Day is exactly the kind of thing a spreadsheet forgets.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It does not touch the yield maths. Accrued interest, day counts and YTM all
 * run on the SCHEDULED dates, because that is what the instrument's terms say
 * and what the prospectus prices. Shifting those to a business day would
 * quietly change every yield in the product to no purpose. This module is for
 * telling a reader when the cash turns up — display and calendar export only.
 *
 * WHAT IS COMPUTED AND WHAT IS NOT
 * --------------------------------
 * Fixed-date holidays are in the Public Holidays Act and never move. Good
 * Friday and Easter Monday move but are computable exactly.
 *
 * The two Eid holidays are NOT computed here, and that is a deliberate refusal
 * rather than an omission. Eid al-Fitr and Eid al-Adha follow the lunar
 * calendar and are declared by gazette notice, sometimes at a day's notice and
 * sometimes on a different day from the astronomical estimate. A calculated
 * approximation would be wrong often enough to mislead, and a reader planning
 * a cash flow around a date this tool invented is worse off than one who was
 * told nothing. `EID_IS_GAZETTED` records the gap so the UI can say so.
 *
 * Source: Public Holidays Act (Cap 110), Laws of Kenya. Verify the current
 * consolidated schedule and any gazetted additions before relying on it — this
 * environment cannot reach Kenya Law directly.
 */

import { GAZETTED_HOLIDAYS, GAZETTE_CHECKED_THROUGH } from '../data/gazetted-holidays';

export interface Holiday {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  name: string;
  /** True when the day is observed on a later date because it fell on a Sunday. */
  observed?: boolean;
}

/** Fixed-date holidays: month (1-12) and day. */
const FIXED: readonly { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 5, day: 1, name: 'Labour Day' },
  { month: 6, day: 1, name: 'Madaraka Day' },
  { month: 10, day: 10, name: 'Huduma Day' },
  { month: 10, day: 20, name: 'Mashujaa Day' },
  { month: 12, day: 12, name: 'Jamhuri Day' },
  { month: 12, day: 25, name: 'Christmas Day' },
  { month: 12, day: 26, name: 'Boxing Day' },
];

/**
 * The two holidays this module cannot compute, named so the UI can be honest.
 *
 * Checked by a test: if somebody later adds a computed Eid, the assertion that
 * this list is non-empty and that no holiday name contains "Eid" will fail,
 * which is the point.
 */
export const EID_IS_GAZETTED = ['Eid al-Fitr', 'Eid al-Adha'] as const;

/**
 * Whether the calendar can be trusted to be COMPLETE for a year.
 *
 * The computed holidays are always right. The gazetted ones are only present
 * if somebody read the notices, so a year past the reading is a year missing
 * up to two holidays with nothing to say so. This lets a surface admit that
 * rather than implying completeness it does not have — the same instinct as
 * refusing to compute Eid in the first place.
 */
export function gazetteCoverage(year: number): {
  complete: boolean;
  note: string | null;
} {
  if (year <= GAZETTE_CHECKED_THROUGH) return { complete: true, note: null };
  return {
    complete: false,
    note:
      `Eid dates for ${year} are set by gazette notice and are not yet recorded here, ` +
      `so a coupon falling on one would show its scheduled date.`,
  };
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** Anonymous Gregorian computus — exact for any year in the Gregorian calendar. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const addDays = (d: Date, n: number): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/**
 * Every computable public holiday in a year, including Sunday observances.
 *
 * Kenyan practice is that a holiday falling on a Sunday is observed on the
 * following Monday; the Sunday itself is listed too, since it is still the
 * holiday and a reader looking up "Christmas Day" should find it on the 25th.
 */
export function holidaysInYear(year: number): Holiday[] {
  const out: Holiday[] = [];

  for (const f of FIXED) {
    const d = new Date(Date.UTC(year, f.month - 1, f.day));
    out.push({ date: iso(d), name: f.name });
    if (d.getUTCDay() === 0) {
      out.push({ date: iso(addDays(d, 1)), name: `${f.name} (observed)`, observed: true });
    }
  }

  const easter = easterSunday(year);
  out.push({ date: iso(addDays(easter, -2)), name: 'Good Friday' });
  out.push({ date: iso(addDays(easter, 1)), name: 'Easter Monday' });

  /* The gazetted days, read from notices rather than computed.
   *
   * Eid and any one-off proclamation live in src/data/gazetted-holidays.ts,
   * each with the notice reference attached. Merged here so every caller —
   * isBusinessDay, paymentDay, both calendar exports — picks them up without
   * knowing they came from a different place. */
  for (const g of GAZETTED_HOLIDAYS) {
    if (g.date.startsWith(String(year))) out.push({ date: g.date, name: g.name });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The holiday falling on a date, or null. Accepts a Date or an ISO string. */
export function holidayOn(date: Date | string): Holiday | null {
  const key = typeof date === 'string' ? date.slice(0, 10) : iso(date);
  const year = Number(key.slice(0, 4));
  if (!Number.isFinite(year)) return null;
  return holidaysInYear(year).find((h) => h.date === key) ?? null;
}

/** Saturday, Sunday, or a public holiday. */
export function isBusinessDay(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  return holidayOn(d) === null;
}

export interface PaymentDay {
  /** The date in the bond's own schedule. */
  scheduled: string;
  /** The day the money can actually move. Equal to `scheduled` when it is a business day. */
  paid: string;
  /** Why it moved, or null when it did not. */
  reason: string | null;
  /** Business days between the two, 0 when unmoved. */
  daysLater: number;
}

/**
 * When a scheduled payment actually lands.
 *
 * Rolls FORWARD, never back: a payment does not arrive before its due date.
 * The loop is bounded because a run of non-business days longer than a fortnight
 * cannot occur — but the bound is explicit rather than trusted, because this
 * takes a date from a text field and an unbounded loop over user input is how
 * a browser tab freezes.
 */
export function paymentDay(scheduled: Date | string): PaymentDay {
  const key = typeof scheduled === 'string' ? scheduled.slice(0, 10) : iso(scheduled);
  let cursor = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) {
    return { scheduled: key, paid: key, reason: null, daysLater: 0 };
  }

  const first = holidayOn(cursor);
  const startedOnWeekend = cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6;
  let moved = 0;

  while (!isBusinessDay(cursor) && moved < 14) {
    cursor = addDays(cursor, 1);
    moved++;
  }

  if (moved === 0) return { scheduled: key, paid: key, reason: null, daysLater: 0 };

  const reason = first
    ? `${first.name} — payment moves to the next business day`
    : startedOnWeekend
      ? 'Falls on a weekend — payment moves to the next business day'
      : 'Not a business day — payment moves to the next business day';

  return { scheduled: key, paid: iso(cursor), reason, daysLater: moved };
}
