/**
 * Public holidays that only exist once somebody gazettes them.
 *
 * `holidays.ts` computes everything computable — the fixed dates in the Public
 * Holidays Act, and Easter, which is exact arithmetic. It deliberately refuses
 * to compute Eid al-Fitr and Eid al-Adha, because those follow the lunar
 * calendar and are DECLARED, sometimes at a day's notice and sometimes on a
 * different day from the astronomical estimate. A date this tool invented
 * would be wrong often enough to mislead somebody planning a cash flow.
 *
 * That refusal left a hole. This file is how the hole gets filled: by a human
 * reading a gazette notice and typing what it says, with the reference
 * attached so the next person can check it.
 *
 * THE RULE FOR ADDING A ROW
 * -------------------------
 * One row per gazetted day, with the notice reference. If you cannot cite the
 * notice, do not add the row — a confident wrong date is worse than a known
 * gap, which is the same reasoning that kept these out of the computation.
 *
 * Presidential proclamations of one-off holidays (a census day, a national
 * day of mourning, an election) belong here too, under the same rule.
 *
 * WHY COVERAGE IS TRACKED PER YEAR
 * --------------------------------
 * An empty list and a year nobody has entered yet are indistinguishable from
 * the data alone, and they mean opposite things: "no gazetted holidays that
 * year" versus "nobody has looked". `GAZETTE_CHECKED_THROUGH` says how far the
 * reading has got, so the UI can admit the limit rather than implying the
 * calendar is complete.
 */

export interface GazettedHoliday {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  name: string;
  /** The Kenya Gazette notice this was read from, so a reader can verify it. */
  reference: string;
}

/**
 * The last year whose gazette notices have actually been read into this file.
 *
 * Bump it only after checking — not when adding a row, and not when a year
 * turns over. Leaving it behind is honest; moving it forward without reading
 * is the failure this constant exists to prevent.
 */
export const GAZETTE_CHECKED_THROUGH = 2026;

/**
 * Deliberately empty at the time of writing.
 *
 * This environment cannot reach the Kenya Gazette, so nothing has been read.
 * Shipping a structure with no rows and an honest coverage marker is the
 * correct state: the calendar now KNOWS it is incomplete and says so, where
 * before it was silently missing two holidays a year with nothing to indicate
 * it. Populating this is a five-minute job for somebody with the notices.
 */
export const GAZETTED_HOLIDAYS: readonly GazettedHoliday[] = [];
