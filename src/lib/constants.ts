/** Kenyan government securities use a 364-day year, 182-day coupon period.
 *  Derived from CBK prospectuses and confirmed by broker contract notes.
 *  See financial-engine.ts for the full derivation. */
export const DAYS_IN_YEAR = 364;
export const DAYS_IN_COUPON_PERIOD = 182;
export const DAY_MS = 86_400_000;
export const YTM_CEILING = 200;
/** The lowest annual yield the solvers search, in percent. A price above every remaining
 *  cash flow has a NEGATIVE yield; below this the solver reports its limit, not a yield. */
export const YTM_FLOOR = -50;
