'use client';

import { formatKES, formatPct } from '@/lib/financial-engine';
import { CASHFLOW_SOURCES, NOT_ADVICE, dataAsOf } from '@/lib/provenance';
import RealTermsNote from './RealTermsNote';
import type {
  FirePlan,
  GoalDefinition,
  IncomePlan,
  IncomeSpreadOption,
  PreservationPlan,
  SchoolFeesPlan,
} from '@/lib/goals';

/**
 * Print-only one-page report for whichever objective is on screen.
 *
 * WHY THE PLANNER NEEDED ITS OWN SHEET
 * ------------------------------------
 * The ladder has printed a proper report since it shipped, and this page —
 * the one where somebody works out whether they can retire, or fund four
 * years of school fees — printed the app: navigation, sliders, cards clipped
 * across a page break. So the most consequential output in the product was
 * the one you could not hand to a spouse or take to a meeting.
 *
 * ONE PAGE IS A CONSTRAINT, NOT AN ASPIRATION
 * -------------------------------------------
 * Each objective renders a fixed, bounded block: no unbounded lists, and the
 * fee and month tables are capped by the inputs themselves (fee years are
 * limited on screen; months are always twelve). That is what keeps the sheet
 * to a single side without CSS tricks, and it is checked by driving the print
 * path and counting the pages in the PDF rather than by hoping.
 *
 * Every figure is passed in already computed. The report derives nothing of
 * its own — a second implementation of any of this maths is a second thing to
 * be wrong, and the number on the printout must be the number on the screen.
 */
export default function GoalReport({
  goal,
  generatedAt,
  fire,
  fees,
  income,
  incomeOptions,
  preservation,
}: {
  goal: GoalDefinition;
  generatedAt: string;
  fire?: FirePlan | null;
  fees?: SchoolFeesPlan | null;
  income?: IncomePlan | null;
  /**
   * The spreads that were NOT chosen, so the sheet can say why this one was.
   *
   * A report showing only the selected plan is unanswerable: the reader takes
   * it to a spouse or a SACCO officer, is asked "why not take more income",
   * and has nothing. The alternatives are the argument.
   */
  incomeOptions?: IncomeSpreadOption[];
  preservation?: PreservationPlan | null;
}) {
  /* Three letters, not one.
   *
   * "J F M A M J J A S O N D" has three J's, two M's and two A's, and this
   * sheet is the artefact somebody prints and reads away from the screen —
   * where "Pays in: J · D" could mean January, June or July and there is
   * nothing to hover or click to find out. The single-letter row was saving
   * horizontal space on a landscape page that has it to spare. */
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* The bound that keeps the income sheet to one page. Twelve rows is twice
   * the six the planner picks by default, and leaves the sheet comfortably
   * inside landscape; anything beyond is counted in the totals and declared
   * below the table rather than dropped. */
  const INCOME_ROWS = 12;
  const hasContent = Boolean(fire || fees || income || preservation);
  if (!hasContent) return null;

  return (
    <div id="goal-report-sheet" className="print-only text-ink">
      <header className="flex items-start justify-between border-b-2 border-gold-500 pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* width/height attributes as well as the CSS: html2canvas paints a
              clone, and if the stylesheet has not applied there an image with
              no intrinsic size expands to its container. That is what put a
              794px logo where the report should have been. */}
          <img src="/logo.svg" alt="" width={48} height={48} className="h-12 w-12 rounded-lg" />
          <div>
            <p className="font-display text-xl font-bold">
              Mwangaza <span className="text-gold-600">Yield</span>
            </p>
            <p className="text-[11px] uppercase tracking-widest text-ink-faint">
              Intelligence layer for Kenya&apos;s bond market
            </p>
          </div>
        </div>
        <div className="text-right text-[11px] text-ink-faint">
          <p>{goal.title} plan</p>
          <p>{generatedAt}</p>
        </div>
      </header>

      {/* h2 for the same reason as the ladder report: this sheet lives inside a
          page that already owns the h1, and two h1s is a document outline lie. */}
      <h2 className="mt-5 font-display text-2xl font-bold">{goal.tagline}</h2>
      <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-ink-muted">
        {goal.description}
      </p>

      {/* ------------------------------------------------ financial independence */}
      {fire && (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Metric label="Capital required" value={formatKES(fire.requiredCapitalKES)} />
            <Metric
              label="Funded so far"
              value={`${Math.round(Math.min(fire.coverageRatio, 1) * 100)}%`}
              tone="mint"
            />
            <Metric
              label="Years to target"
              value={fire.yearsToTarget === null ? 'Beyond 40' : `${fire.yearsToTarget.toFixed(1)}`}
            />
          </div>
          <Section title="How this was worked out" />
          <table className="w-full text-[12px]">
            <tbody>
              <Row label="Target annual income (net)" value={formatKES(fire.targetAnnualIncomeKES)} />
              <Row
                label="Planning yield — a ladder, marked down for rate falls already on the record"
                value={formatPct(fire.planningNetYield)}
              />
              <Row
                label="Same ladder at today's rates (the optimistic end)"
                value={formatPct(fire.currentLadderNetYield)}
              />
              <Row label="Capital you have today" value={formatKES(fire.currentCapitalKES)} />
              <Row label="Net income that already produces" value={formatKES(fire.incomeFromCurrentKES)} />
              <Row label="Shortfall" value={formatKES(fire.shortfallKES)} />
            </tbody>
          </table>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Planned on a <strong>{fire.ladderRungs}-bond ladder</strong> at{' '}
            {formatPct(fire.planningNetYield)}, which is {fire.downsidePp.toFixed(2)} percentage
            points below what the same ladder yields today — the fall the Central Bank Rate has
            genuinely made on the record, not a guess about the future. Highest single net yield on
            the board is {formatPct(fire.bestNetYield)}
            {fire.bestBond ? ` (${fire.bestBond.issueCode})` : ''}, reported for context and
            deliberately not planned on: one bond is not a plan.
          </p>
          {/* The longest-horizon plan in the product, and the one where fixed
            * coupons erode most. */}
          <RealTermsNote />
        </>
      )}

      {/* --------------------------------------------------------- school fees */}
      {fees && (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Metric label="Total fees" value={formatKES(fees.totalFeesKES)} />
            <Metric label="Covered by this plan" value={formatKES(fees.totalCoveredKES)} tone="mint" />
            <Metric
              label="Status"
              value={fees.fullyFunded ? 'Fully funded' : 'Shortfall'}
              tone={fees.fullyFunded ? 'mint' : 'gold'}
            />
          </div>
          <Section title="Year by year" />
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-sand-300 text-left text-[10px] uppercase tracking-wide text-ink-faint">
                <th className="py-1.5">Year</th>
                <th className="py-1.5 text-right">Fee due</th>
                <th className="py-1.5 text-right">Principal maturing</th>
                <th className="py-1.5 text-right">Coupons</th>
                <th className="py-1.5 text-right">Covered</th>
                <th className="py-1.5 text-right">Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {fees.years.map((y) => (
                <tr key={y.year} className="border-b border-sand-200 last:border-0">
                  <td className="num py-1.5 font-medium">{y.year}</td>
                  <td className="num py-1.5 text-right">{formatKES(y.feeKES)}</td>
                  <td className="num py-1.5 text-right">{formatKES(y.principalMaturingKES)}</td>
                  <td className="num py-1.5 text-right">{formatKES(y.couponsKES)}</td>
                  <td className="num py-1.5 text-right text-mint-700">{formatKES(y.coveredKES)}</td>
                  <td className="num py-1.5 text-right">
                    {y.shortfallKES > 0 ? formatKES(y.shortfallKES) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Section title="The bonds behind it" />
          <BondTable rungs={fees.ladder.rungs} />
          {/* School fees are the one plan whose TARGET inflates too — fees rise
            * faster than the general basket in most years — so a nominal-only
            * sheet flatters this objective more than any other. */}
          <RealTermsNote />
        </>
      )}

      {/* ------------------------------------------------------ passive income */}
      {income && (
        <>
          {/* "In the months it pays", not an annual figure divided by twelve.
            *
            * The same defect the screen carried until it was fixed, left behind
            * here: with six paying months, the flat average understates every
            * month that pays by half and overstates the six that pay nothing by
            * the whole amount. A printout is exactly what somebody budgets from,
            * and it outlives the session that produced it. */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Metric label="Net income / year" value={formatKES(income.totalNetAnnualKES)} tone="mint" />
            <Metric
              label={income.monthsPaid === 12 ? 'Every month' : 'In the months it pays'}
              value={formatKES(
                income.monthsPaid > 0 ? income.totalNetAnnualKES / income.monthsPaid : 0
              )}
            />
            <Metric label="Months paid" value={`${income.monthsPaid} of 12`} />
          </div>
          <Section title="When the money lands" />
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-ink-faint">
                {MONTHS.map((m, i) => (
                  <th key={i} className="pb-1 text-center">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {income.monthlyIncomeKES.map((v, i) => (
                  <td
                    key={i}
                    className={`num border border-sand-200 py-2 text-center text-[10px] ${
                      v > 0 ? 'bg-mint-500/10 font-semibold text-mint-700' : 'text-ink-faint'
                    }`}
                  >
                    {v > 0 ? Math.round(v / 1000) + 'k' : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          {/* Side by side, because the sheet is landscape.
            *
            * Stacked, these two four-column tables ran down the page while half
            * the width sat empty — a portrait layout on a landscape page. The
            * holdings and the alternatives are also the natural pair to read
            * against each other: what was bought, and what was not. */}
          {/* One column when there is nothing to sit beside it.
            *
            * A reader who names their own bonds gets no alternatives — offering
            * them would invite discarding an explicit choice — and a fixed
            * two-column grid then left the right half of the sheet blank, which
            * is the waste this layout existed to remove. */}
          <div className={incomeOptions && incomeOptions.length > 0 ? 'grid grid-cols-2 gap-8' : ''}>
          <div>
          <Section title="The bonds behind it" />
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-sand-300 text-left text-[10px] uppercase tracking-wide text-ink-faint">
                <th className="py-1.5">Bond</th>
                <th className="py-1.5 text-right">Face value</th>
                {/* "each", because this is the PER-PAYMENT coupon, not the
                  * annual one — netCouponPerPeriodKES straight from the plan.
                  *
                  * Unlabelled it reads as a year's income beside a face value,
                  * and a reader doing the obvious division got half the real
                  * yield: Ksh 392,290 on Ksh 4,250,000 looks like 9.2% when the
                  * bond actually pays 18.5% a year. The month grid above
                  * disambiguates it, but this table is the one somebody reads a
                  * single row out of. */}
                <th className="py-1.5 text-right">Net coupon (each)</th>
                <th className="py-1.5 text-right">Pays in</th>
              </tr>
            </thead>
            <tbody>
              {income.holdings.slice(0, INCOME_ROWS).map((h) => (
                <tr key={h.bond.isin} className="border-b border-sand-200 last:border-0">
                  <td className="py-1.5 font-medium">
                    {h.bond.issueCode}
                    {h.bond.taxExempt && (
                      <span className="ml-1 text-[9px] font-semibold uppercase text-mint-700">tax-free</span>
                    )}
                  </td>
                  <td className="num py-1.5 text-right">{formatKES(h.faceValueKES)}</td>
                  <td className="num py-1.5 text-right">{formatKES(h.netCouponKES)}</td>
                  <td className="num py-1.5 text-right">
                    {h.months.map((m) => MONTHS[m]).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* The remainder, said out loud.
            *
            * The planner picks six by default, but a reader may name as many
            * bonds as they like — and every one added another row to a sheet
            * that has to stay one page. At twenty-one holdings it grew to
            * 1123x1110, which no longer crops (the fit contains it) but shrinks
            * to 212mm on a 297mm page and takes every figure down with it.
            *
            * Truncating silently would be worse than either: a sheet that
            * looks complete and is not, handed to somebody as a record of what
            * was bought. The totals above still count all of them. */}
          {income.holdings.length > INCOME_ROWS && (
            <p className="mt-1.5 text-[11px] text-ink-muted">
              {income.holdings.length - INCOME_ROWS} further holding
              {income.holdings.length - INCOME_ROWS === 1 ? '' : 's'} not listed here, of{' '}
              {income.holdings.length}. Every figure above counts all of them.
            </p>
          )}

          </div>

          {/* Why this spread and not another.
            *
            * A report showing only the chosen plan is unanswerable: the reader
            * takes it to a spouse or a SACCO officer, is asked "why not take
            * more income", and has nothing. Everything here is passed in
            * already computed — the printout must show the same shillings the
            * screen did. */}
          {incomeOptions && incomeOptions.length > 0 && (
            <div>
              <Section title="Why this spread" />
              <p className="mb-2 text-[11px] leading-relaxed text-ink-muted">
                Kenyan bonds pay twice a year, so one bond covers two months six apart and it
                takes six of them to reach every month. Filling a gap month means buying the
                best bond that pays IN it rather than the best bond available — so a wider
                spread earns less. Every option below was priced on the same capital.
              </p>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-sand-300 text-left text-[10px] uppercase tracking-wide text-ink-faint">
                    <th className="py-1.5">Spread</th>
                    <th className="py-1.5 text-right">Months paid</th>
                    <th className="py-1.5 text-right">Net income / year</th>
                    <th className="py-1.5 text-right">Income forgone</th>
                  </tr>
                </thead>
                <tbody>
                  {incomeOptions.map((o) => {
                    const chosen = o.holdings === income.holdings.length;
                    return (
                      <tr
                        key={o.holdings}
                        className={`border-b border-sand-200 last:border-0 ${
                          chosen ? 'font-semibold text-ink' : 'text-ink-soft'
                        }`}
                      >
                        <td className="py-1.5">
                          {o.holdings} bonds
                          {chosen && <span className="ml-1 text-[9px] uppercase text-gold-700">chosen</span>}
                        </td>
                        <td className="num py-1.5 text-right">{o.plan.monthsPaid} of 12</td>
                        <td className="num py-1.5 text-right">{formatKES(o.plan.totalNetAnnualKES)}</td>
                        <td className="num py-1.5 text-right">
                          {o.givesUpKES > 0 ? `−${formatKES(o.givesUpKES)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>
          <RealTermsNote />
        </>
      )}

      {/* --------------------------------------------------- capital preservation */}
      {preservation && (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Metric label="Net yield" value={formatPct(preservation.netEAY)} tone="mint" />
            <Metric label="You pay today" value={formatKES(preservation.costKES)} />
            <Metric
              label={`Back in ${preservation.tenorDays} days`}
              value={formatKES(preservation.netProceedsKES)}
            />
          </div>
          <Section title="The arithmetic" />
          <table className="w-full text-[12px]">
            <tbody>
              <Row
                label={`Quoted discount rate (${preservation.tenorDays}-day bill)`}
                value={formatPct(preservation.discountRate)}
              />
              <Row label="Net effective annual yield" value={formatPct(preservation.netEAY)} />
              <Row label="Interest kept after 15% withholding tax" value={formatKES(preservation.netInterestKES)} />
            </tbody>
          </table>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            The shortest tenor on offer, chosen because liquidity is the objective here rather than
            yield. The quoted rate is a discount, not a return: it is earned on a smaller outlay, so
            the true yield is higher — and 15% withholding tax then pulls the net below the quote.
            The figure above is the net.
          </p>
        </>
      )}

      <footer className="mt-6 border-t border-sand-300 pt-3 text-[10px] leading-relaxed text-ink-faint">
        Yields are solved from each bond&apos;s remaining cash-flow schedule; withholding tax applies
        to coupons only (infrastructure bonds are exempt) and principal redemption is untaxed.
        Accrued interest uses Actual/364 and coupon dates run in exact 182-day steps from issue — the
        basis Kenyan government bonds are built on. {NOT_ADVICE}
        {' '}
        {CASHFLOW_SOURCES} Bond data as of {dataAsOf()}.
      </footer>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: string;
  tone?: 'ink' | 'mint' | 'gold';
}) {
  const colour =
    tone === 'mint' ? 'text-mint-700' : tone === 'gold' ? 'text-gold-700' : 'text-ink';
  return (
    <div className="rounded-lg border border-sand-300 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`num mt-0.5 text-base font-bold ${colour}`}>{value}</p>
    </div>
  );
}

function Section({ title }: { title: string }) {
  return (
    <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
      {title}
    </h3>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-sand-200 last:border-0">
      <td className="py-1.5 pr-4 text-ink-soft">{label}</td>
      <td className="num py-1.5 text-right font-medium">{value}</td>
    </tr>
  );
}

/** Shared by the fee plan; kept here so the report has one bond-table style. */
function BondTable({ rungs }: { rungs: SchoolFeesPlan['ladder']['rungs'] }) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="border-b border-sand-300 text-left text-[10px] uppercase tracking-wide text-ink-faint">
          <th className="py-1.5">Bond</th>
          <th className="py-1.5 text-right">Face value</th>
          <th className="py-1.5 text-right">Price</th>
          <th className="py-1.5 text-right">Net yield</th>
          <th className="py-1.5 text-right">Matures</th>
        </tr>
      </thead>
      <tbody>
        {rungs.map((r) => (
          <tr key={r.bond.isin} className="border-b border-sand-200 last:border-0">
            <td className="py-1.5 font-medium">
              {r.bond.issueCode}
              {r.bond.taxExempt && (
                <span className="ml-1 text-[9px] font-semibold uppercase text-mint-700">tax-free</span>
              )}
            </td>
            <td className="num py-1.5 text-right">{formatKES(r.faceValueKES)}</td>
            <td className="num py-1.5 text-right">{r.price.toFixed(2)}</td>
            <td className="num py-1.5 text-right text-gold-700">{formatPct(r.result.netYTM)}</td>
            <td className="num py-1.5 text-right text-ink-soft">{r.bond.maturityDate}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
