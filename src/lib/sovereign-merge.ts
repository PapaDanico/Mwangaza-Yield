/**
 * Which source a reader sees when two of them publish the same ratio.
 *
 * WHY THERE ARE TWO
 * -----------------
 * The sovereign panel shipped entirely from the World Bank, whose Kenya series
 * are annual compilations that lag their reference year. The National Treasury
 * publishes three of the same ratios QUARTERLY, in its own Quarterly Economic
 * and Budgetary Review, and `qebr_parser.py` has been able to read them for
 * some time without being wired to write.
 *
 * The gap that closed is not cosmetic. Measured on 2026-08-16:
 *
 *   indicator              World Bank        QEBR
 *   GDP growth             4.63  (2025)      4.6   (2026-03-31)
 *   Reserves import cover  4.03  (2024)      5.7   (2026-03-31)
 *   Current account / GDP  -1.29 (2024)      -3.0  (2026-03-31)
 *
 * Both stale figures FLATTER THE BORROWER on a panel headed "Can the borrower
 * pay?" — reserves sitting on the statutory floor of four when the real buffer
 * is 5.7, and a current-account deficit shown at less than half its current
 * size. One makes Kenya look weaker than it is and the other stronger, which is
 * worse than a consistent bias because a reader cannot correct for it.
 *
 * THE RULE
 * --------
 * Fresher wins, compared by `asOf`. That is not a preference for the Treasury:
 * it is the same rule that would hand the row back to the World Bank if the
 * QEBR went quiet for a year, which is exactly what should happen then.
 *
 * The panel already renders `source` and `asOf` on every row, so nothing about
 * provenance is hidden by merging — a reader can still see which institution
 * published the number they are looking at.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It does not compute, average or reconcile. Where both sources have a row the
 * fresher one is shown WHOLE — its value, its date, its note and its source
 * together. Blending two institutions' figures would produce a number neither
 * of them published, which is the one thing this panel must never show.
 *
 * `Interest / government revenue` stays with the World Bank at 2023 even though
 * it is the oldest figure on the panel, because `qebr_parser` refuses it: the
 * QEBR's available matches are FOREIGN interest and a revenue SHORTFALL, and
 * reading them as totals gives 94.7% against a real figure nearer a third.
 * That refusal is load-bearing. Do not "fix" it here.
 */
import type { ContextIndicator } from '@/types/bond';

/**
 * Compare two `asOf` stamps that are not the same shape.
 *
 * The World Bank writes a year (`"2025"`); the QEBR writes a quarter-end date
 * (`"2026-03-31"`). Comparing the strings directly happens to work for these
 * two formats, but only by luck of lexicographic ordering — so the year is
 * widened to its last day, which is the honest reading of an annual figure and
 * makes the comparison mean what it says.
 */
function asOfKey(asOf: string): string {
  if (/^\d{4}$/.test(asOf)) return `${asOf}-12-31`;
  return asOf;
}

/**
 * One row per indicator, taking the fresher of the two sources.
 *
 * Order follows `primary` so the panel's existing arrangement is preserved;
 * rows that exist only in `secondary` are appended rather than dropped.
 */
export function mergeSovereign(
  primary: ContextIndicator[],
  secondary: ContextIndicator[] = []
): ContextIndicator[] {
  if (!secondary.length) return primary;

  const bySecondaryLabel = new Map(secondary.map((r) => [r.label, r]));
  const merged = primary.map((row) => {
    const other = bySecondaryLabel.get(row.label);
    if (!other) return row;
    bySecondaryLabel.delete(row.label);
    return asOfKey(other.asOf) > asOfKey(row.asOf) ? other : row;
  });

  // Anything the secondary source has that the primary never carried. Appending
  // rather than ignoring: a ratio the Treasury publishes and the World Bank
  // does not is exactly the kind of gap this panel exists to close.
  return [...merged, ...bySecondaryLabel.values()];
}
