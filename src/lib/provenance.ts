import meta from '../../public/data/meta.json';

/**
 * What a printed report actually rests on.
 *
 * The footers on both reports read "Sources: Central Bank of Kenya, National
 * Treasury, KNBS". Neither report touches Treasury or KNBS data — they compute
 * from bond cash flows and a price, and nothing else. Two of the three credits
 * were decorative.
 *
 * On a free page that is sloppy. On a document somebody prints and hands to a
 * board, an auditor or a client it is a misstatement of provenance in the one
 * artifact that leaves the building, and it is the artifact rather than the
 * screen that gets relied on later. If this project ever charges for a report,
 * the source line is the first thing a serious reader will test.
 *
 * There is a subtler version of the same error and this project already
 * documents it on /sources: the CPI figure originates with KNBS but is READ
 * FROM CBK, because KNBS is not reliably reachable. Crediting KNBS implies we
 * fetched it. We did not, and the data file records the substitution against
 * every reading.
 *
 * So this states, per report, only what that report used — and the date the
 * underlying dataset was built, because "as of when" is the question a figure
 * on paper cannot answer for itself once it is off the screen.
 */

export const DATA_GENERATED_AT: string = meta.generatedAt;

/** Just the calendar day; a printed footer does not need microseconds. */
export function dataAsOf(): string {
  return DATA_GENERATED_AT.slice(0, 10);
}

/**
 * The sources a cash-flow report genuinely rests on.
 *
 * Bond terms — coupon, maturity, tax status — come from the CBK securities
 * register reconciled against CBK's own published auction results. The price
 * is either one the reader entered or par, declared as such. Nothing else is
 * consulted, so nothing else is credited.
 */
export const CASHFLOW_SOURCES =
  'Bond terms from the Central Bank of Kenya securities register and CBK published ' +
  'auction results. Prices are the ones you entered, or par where stated — no market ' +
  'price is published here.';

/**
 * The line that keeps an educational analytic from reading as a recommendation.
 *
 * Deliberately says what the document IS rather than only what it is not: a
 * calculation from stated inputs. "Not advice" alone invites the reader to
 * wonder what it is instead.
 */
export const NOT_ADVICE =
  'This is a calculation from the inputs shown, not investment advice, and not an ' +
  'offer to buy or sell. Verify every figure against the official prospectus and your ' +
  'own CSD statement before committing funds.';
