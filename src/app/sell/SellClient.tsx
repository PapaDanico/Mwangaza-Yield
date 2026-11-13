'use client';

import { useEffect, useMemo, useState } from 'react';
import { readQuoteParams, shareableQuoteUrl } from '@/lib/quote-link';
import { APP_URL, shareText } from '@/lib/share';
import { plural, CURRENCY_LABEL, nonNegativeNumber, MAX_QUOTED_PRICE, MAX_QUOTED_YTM_PCT } from '@/lib/utils';
import Link from 'next/link';
import { ArrowRightLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Bond } from '@/types/bond';
import { outstanding } from '@/lib/outstanding';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { resolvePrice } from '@/lib/prices';
import { analyseSale, findReplacements, verdict, type SaleQuote } from '@/lib/sell';
import { track } from '@/lib/analytics';
import { rateShocks } from '@/lib/rate-shocks';
import { computeBondInvestment, formatKES, formatPct } from '@/lib/financial-engine';
import DataState from '@/components/shared/DataState';
import LiveResult from '@/components/shared/LiveResult';
import { inputCls, labelCls } from '@/lib/field-styles';

/**
 * The sell side.
 *
 * A broker's pricing sheet answers "what is the transaction?" and stops. It
 * never answers "should I?" — that is not what it is for. This page takes the
 * numbers off that sheet, checks them independently, and works out the two
 * figures the sheet cannot give you: what you are really selling at once
 * charges are paid, and what your next investment must earn for the swap to
 * leave you no worse off.
 *
 * Everything is typed in by the reader from their own quote. Nothing is
 * fetched, and no market price is needed.
 */
export default function SellClient() {
  const allBonds = useBondStore((s) => s.bonds);
  const bonds = useMemo(() => outstanding(allBonds), [allBonds]);
  const secondary = useBondStore((s) => s.secondary);
  const userPrices = usePriceStore((s) => s.userPrices);

  const [isin, setIsin] = useState('');
  const [face, setFace] = useState(400_000);
  /**
   * Today, not blank.
   *
   * This field was empty on arrival, and line 47 returns null without it — so
   * a reader who landed here, saw the bond and face value already filled in,
   * and typed the price off their broker sheet got NOTHING back. No figure, no
   * reason, no indication that the tool wanted anything else. That is how a
   * working page comes to be reported as broken.
   *
   * Set after mount rather than in the initial state: this is a static export,
   * and a date rendered at build time disagrees with the browser's on the
   * first paint. Same reason the ladder sets its date in an effect.
   */
  const [settlement, setSettlement] = useState('');
  useEffect(() => {
    setSettlement((current) => current || new Date().toISOString().slice(0, 10));
  }, []);

  /* A shared quote opens the SENDER's numbers.
   *
   * /sell is the page most likely to be shown to a second person — an advisor,
   * a spouse, the broker who gave the quote — and it was the only one with no
   * way to do that. Reading nine fields down the phone, or sending a
   * screenshot nobody can recalculate from, was the alternative.
   *
   * Seeded once on mount. These are plain useState fields rather than the
   * price book's persisted ones, so there is nothing to fight here: the
   * recipient changes a number and it stays changed, which is the entire point
   * of sending them the link.
   *
   * Ordered AFTER the settlement effect above deliberately — that one only
   * fills a blank (`current || today`), so a settlement date carried by the
   * link survives it rather than being overwritten with today. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shared = readQuoteParams(window.location.search);
    if (Object.keys(shared).length === 0) return;
    if (shared.isin !== undefined) setIsin(shared.isin);
    if (shared.face !== undefined) setFace(shared.face);
    if (shared.dirty !== undefined) setDirty(String(shared.dirty));
    if (shared.quotedYTM !== undefined) setQuotedYTM(String(shared.quotedYTM));
    if (shared.commission !== undefined) setCommission(shared.commission);
    if (shared.levies !== undefined) setLevies(shared.levies);
    if (shared.settlement !== undefined) setSettlement(shared.settlement);
  }, []);
  const [dirty, setDirty] = useState('');
  const [quotedYTM, setQuotedYTM] = useState('');
  const [commission, setCommission] = useState(1_500);
  const [levies, setLevies] = useState(0);
  const [amortDate, setAmortDate] = useState('');
  const [amortPct, setAmortPct] = useState(50);

  const bond = bonds.find((b) => b.isin === isin) ?? bonds.find((b) => b.taxExempt) ?? bonds[0];

  const quote: SaleQuote | null = useMemo(() => {
    if (!bond || !settlement || !dirty) return null;
    const d = Number(dirty);
    if (!Number.isFinite(d) || d <= 0 || d > MAX_QUOTED_PRICE) return null;
    // A quoted yield outside any real range is treated as not given, so it
    // cannot reach the "our price does not match your sheet" arithmetic.
    const q = quotedYTM ? Number(quotedYTM) : undefined;
    const quoted = q !== undefined && Number.isFinite(q) && q > 0 && q <= MAX_QUOTED_YTM_PCT ? q : undefined;
    return {
      faceValueKES: face,
      settlementDate: settlement,
      dirtyPrice: d,
      quotedYTM: quoted,
      commissionKES: commission,
      leviesKES: levies,
      amortisation: amortDate && amortPct > 0
        ? [{ date: amortDate, fraction: amortPct / 100 }]
        : [],
    };
  }, [bond, face, settlement, dirty, quotedYTM, commission, levies, amortDate, amortPct]);

  // An impossible amortisation schedule (a date outside the bond's life, a
  // percentage over 100) is rejected by the library; show that, do not crash.
  const { analysis, scheduleProblem } = useMemo(() => {
    if (!bond || !quote) return { analysis: null, scheduleProblem: false };
    try {
      return { analysis: analyseSale(bond, quote), scheduleProblem: false };
    } catch (e) {
      if (e instanceof RangeError) return { analysis: null, scheduleProblem: true };
      throw e;
    }
  }, [bond, quote]);

  // Repricing needs the plain coupon schedule; an amortising holding has a
  // different one, so it gets no table rather than a wrong one.
  const shocks = useMemo(
    () => (bond && quote && analysis && !(quote.amortisation?.length) ? rateShocks(bond, new Date(settlement), analysis.dirtyPrice) : null),
    [bond, quote, analysis, settlement]
  );

  useEffect(() => {
    if (analysis) track('act:sell-analysed');
  }, [analysis]);

  const replacements = useMemo(() => {
    if (!analysis || !bond) return [];
    const asOf = settlement ? new Date(settlement) : new Date();
    return findReplacements(
      bonds,
      analysis.breakEvenNetYield,
      (b) => resolvePrice(b, secondary, userPrices, asOf).price,
      (b, price) => computeBondInvestment(b, 100_000, price, asOf).netYTM,
      bond.isin,
      asOf
    ).slice(0, 6);
  }, [analysis, bond, bonds, secondary, userPrices, settlement]);

  if (!bonds.length) return <DataState reserve="h-[900px]" />;

  return (
    <>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-4">
          <div>
            <label htmlFor="sell-bond" className={labelCls}>Bond you are selling</label>
            <select
              id="sell-bond"
              value={bond?.isin ?? ''}
              onChange={(e) => setIsin(e.target.value)}
              className={inputCls}
            >
              {bonds.map((b) => (
                <option key={b.isin} value={b.isin}>
                  {b.issueCode} — {b.couponRate}%{b.taxExempt ? ', tax-free' : ''}, matures{' '}
                  {b.maturityDate.slice(0, 4)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="sell-face" className={labelCls}>Face value ({CURRENCY_LABEL})</label>
              <input id="sell-face" type="number" inputMode="numeric" value={face}
                onChange={(e) => setFace(nonNegativeNumber(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label htmlFor="sell-date" className={labelCls}>Value date</label>
              <input id="sell-date" type="date" value={settlement}
                onChange={(e) => setSettlement(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="sell-dirty" className={labelCls}>Dirty price (per 100)</label>
              <input id="sell-dirty" type="number" step="0.0001" inputMode="decimal" value={dirty}
                placeholder="107.8145"
                onChange={(e) => setDirty(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="sell-ytm" className={labelCls}>Quoted yield % (optional)</label>
              <input id="sell-ytm" type="number" step="0.0001" inputMode="decimal" value={quotedYTM}
                placeholder="12.5000"
                onChange={(e) => setQuotedYTM(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="sell-comm" className={labelCls}>Commission ({CURRENCY_LABEL})</label>
              <input id="sell-comm" type="number" inputMode="numeric" value={commission}
                onChange={(e) => setCommission(nonNegativeNumber(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label htmlFor="sell-levy" className={labelCls}>CMA / NSE / CDSC levies ({CURRENCY_LABEL})</label>
              <input id="sell-levy" type="number" step="0.01" inputMode="decimal" value={levies}
                onChange={(e) => setLevies(nonNegativeNumber(e.target.value))} className={inputCls} />
            </div>
          </div>

          {/* Amortisation is not an exotic detail. On the sheet that prompted this
              page it moved the price by 1.8 per 100 — about Ksh 7,300 on a
              Ksh 400,000 trade — and it appears as a single line in braces that
              is easy to read past. */}
          <div className="rounded-xl border border-sand-300 bg-sand-100/60 p-3">
            <p className="text-[12px] font-medium text-ink-soft">
              Does this bond repay principal early?
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
              Many infrastructure bonds do. Your sheet may show it as
              &ldquo;Amortization Dates&rdquo;. Leaving it out overstates the bond — on a real
              18-year IFB quote it was worth <span className="num">1.83</span> per 100.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input type="date" value={amortDate} aria-label="Amortisation date"
                onChange={(e) => setAmortDate(e.target.value)} className={inputCls} />
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={100} value={amortPct} aria-label="Percent of principal repaid"
                  onChange={(e) => setAmortPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className={inputCls} />
                <span className="shrink-0 text-sm text-ink-muted">% of principal</span>
              </div>
            </div>
          </div>
        </div>

        {analysis && bond ? (
          <div className="space-y-3">
            <LiveResult>
              {`Net proceeds ${formatKES(analysis.netProceedsKES)}. You are really selling at `
                + `${formatPct(analysis.effectiveSaleYield)}. To stand still, a taxable replacement `
                + `must yield ${formatPct(analysis.breakEvenTaxableGrossYield)} gross.`}
            </LiveResult>

            {/* A yield annualised from under a year of remaining life is a
              * rate nobody can go and buy.
              *
              * Found by driving the page: the default holding matures 62 days
              * out, and a 98.5 dirty price with a full coupon still due gives
              * an effective sale yield of 46.61% and a break-even of 51.79%
              * gross. The arithmetic is right, and at that price the seller
              * really is giving value away — the signal is worth keeping.
              *
              * The instruction is what breaks. "A taxable replacement must
              * yield 51.79%" sends a reader after an instrument that does not
              * exist: this market runs 8-16%, and anything inside a year is a
              * Treasury bill near 9%. Someone who cannot find it may decide
              * the sale was fine after all, which is the opposite of what the
              * number was telling them.
              *
              * So the figures stay — they are true, and hiding a true number
              * is its own dishonesty — and the caption redirects to the
              * shilling amounts, which do not distort with the horizon. */}
            {analysis.annualisationIsExtrapolated && (
              <p className="rounded-xl border border-gold-300/60 bg-gold-50/40 p-3 text-xs leading-relaxed text-ink-muted">
                <span className="font-semibold text-ink">
                  These percentages are annualised from{' '}
                  {analysis.daysToMaturity} days of remaining life.
                </span>{' '}
                A short horizon makes them look enormous, and no bond or bill on
                sale in Kenya pays anything like{' '}
                {formatPct(analysis.breakEvenTaxableGrossYield)} — anything maturing
                inside a year is a Treasury bill nearer 9%. Read the shilling
                figures below instead: they are what you actually gain or give up,
                and they do not stretch with the horizon.
              </p>
            )}

            {/* Send the QUOTE, not a screenshot.
              *
              * The message carries the answer so it reads on its own in a chat,
              * and the link carries the nine inputs behind it so the person
              * receiving it can change one and see what happens. A screenshot
              * does the first and none of the second, which is why this page
              * was the one people photographed. */}
            <button
              type="button"
              onClick={() => {
                const link = shareableQuoteUrl(
                  {
                    isin: bond.isin,
                    face,
                    dirty: Number(dirty),
                    quotedYTM: quotedYTM ? Number(quotedYTM) : undefined,
                    commission,
                    levies,
                    settlement,
                  },
                  APP_URL
                );
                shareText(
                  `*Sale quote — ${bond.issueCode}*\n\n`
                    + `Face ${formatKES(face)} settling ${settlement}\n`
                    + `Net proceeds ${formatKES(analysis.netProceedsKES)}\n`
                    + `Effective sale yield ${formatPct(analysis.effectiveSaleYield)}\n`
                    + `A taxable replacement must yield `
                    + `${formatPct(analysis.breakEvenTaxableGrossYield)} gross to stand still\n\n`
                    + `Open these numbers and change them → ${link}`
                );
              }}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-ink-line text-sm font-medium text-ink-soft"
            >
              Share this quote
            </button>

            {analysis.quoteDisagrees && (
              <div className="rounded-xl border border-gold-500 bg-gold-100/60 p-3">
                <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-soft">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-gold-700" />
                  <span>
                    <strong>Our price does not match your sheet.</strong> At the quoted{' '}
                    <span className="num">{quotedYTM}%</span> we get{' '}
                    <span className="num">{analysis.ourDirtyAtQuotedYTM?.toFixed(4)}</span> against
                    your <span className="num">{analysis.dirtyPrice.toFixed(4)}</span>. The usual
                    cause is a principal repayment we have not been told about — set the
                    amortisation above and see whether the two agree.
                  </span>
                </p>
              </div>
            )}
            {!analysis.quoteDisagrees && quotedYTM && (
              <p className="flex items-center gap-1.5 text-[12px] text-mint-700">
                <CheckCircle2 size={14} /> Our arithmetic reproduces your broker&apos;s price at the
                quoted yield.
              </p>
            )}

            <div className="card p-0">
              <table className="w-full text-sm">
                <tbody>
                  <Row label="Accrued interest" hint={`${analysis.daysAccrued} days`}
                    value={formatKES(analysis.accruedInterestKES)} />
                  <Row label="Clean price" value={analysis.cleanPrice.toFixed(4)} />
                  <Row label="Consideration" value={formatKES(analysis.considerationKES)} />
                  <Row label="Charges" value={`− ${formatKES(analysis.totalChargesKES)}`} />
                  <Row label="Net proceeds" value={formatKES(analysis.netProceedsKES)} accent />
                </tbody>
              </table>
            </div>

            <div className="card space-y-2">
              <h2 className="font-display text-sm font-bold text-ink-soft">
                What the sheet does not say
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  <Row label="You are really selling at"
                    hint={`charges cost you ${analysis.chargeDragPp.toFixed(3)} points of yield`}
                    value={formatPct(analysis.effectiveSaleYield)} accent />
                  <Row label="Break-even, net of tax"
                    hint="a replacement must beat this, after tax"
                    value={formatPct(analysis.breakEvenNetYield)} />
                  <Row label="…so a taxed bond must yield"
                    hint={`grossed up for ${(analysis.whtRateOnReplacement * 100).toFixed(0)}% withholding tax`}
                    value={formatPct(analysis.breakEvenTaxableGrossYield)} accent />
                </tbody>
              </table>
              {bond.taxExempt && (
                <p className="rounded-lg bg-sand-200/70 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
                  <strong>This is a tax-free bond.</strong> Its coupons reach you whole. An
                  ordinary bond loses{' '}
                  <span className="num">{(analysis.whtRateOnReplacement * 100).toFixed(0)}%</span> of
                  every coupon to withholding tax, so it has to clear a visibly higher headline
                  before it actually pays you more. That gap is the most expensive thing on this
                  page, and no pricing sheet will mention it.
                </p>
              )}
            </div>

            {shocks && (
              <details className="card group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-display text-sm font-bold text-ink-soft marker:content-none">
                  If market yields move before you sell
                  <span aria-hidden className="text-lg text-gold-700 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
                  Repriced exactly from this bond&apos;s own coupons and dates, starting from the {formatPct(shocks.anchorYieldPct)} implied by your
                  price. Rates up means a lower price; rates down, a higher one. A scenario to size the risk of waiting, not a forecast.
                  Charges are not included.
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Sale price if the market yield moved</caption>
                    <thead>
                      <tr className="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-ink-muted">
                        <th scope="col" className="py-2">Yield moves</th>
                        <th scope="col" className="py-2 text-right">Yield</th>
                        <th scope="col" className="py-2 text-right">Price per 100</th>
                        <th scope="col" className="py-2 text-right">On your holding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shocks.rows.map((r) => (
                        <tr key={r.shockBp} className="border-b border-sand-200 last:border-0">
                          <th scope="row" className="num py-1.5 text-left font-medium text-ink">
                            {r.shockBp === 0 ? 'Today' : `${r.shockBp > 0 ? '+' : '−'}${Math.abs(r.shockBp)} bp`}
                          </th>
                          <td className="num py-1.5 text-right text-ink">{formatPct(r.yieldPct)}</td>
                          <td className="num py-1.5 text-right text-ink">{r.dirtyPrice.toFixed(2)}</td>
                          <td className="num py-1.5 text-right text-ink-soft">
                            {r.shockBp === 0 ? '—' : `${r.changePer100 > 0 ? '+' : '−'}${formatKES(Math.abs((r.changePer100 / 100) * face))}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            <div className="card space-y-2">
              <h2 className="font-display text-sm font-bold text-ink-soft">
                What could replace it
              </h2>
              <p className="text-[12px] leading-relaxed text-ink-faint">
                {verdict(analysis, bond, replacements[0] ?? null)}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2">Bond</th>
                      <th className="py-2 text-right">Net yield</th>
                      <th className="py-2 text-right">vs break-even</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replacements.map((r) => (
                      <tr key={r.bond.isin} className="border-b border-sand-300/60 last:border-0">
                        <td className="py-2">
                          <span className="font-medium text-ink">{r.bond.issueCode}</span>
                          {r.bond.taxExempt && (
                            <span className="ml-1.5 rounded-full bg-mint-500/15 px-1.5 py-0.5 text-xs font-semibold text-mint-700">
                              TAX-FREE
                            </span>
                          )}
                        </td>
                        <td className="num py-2 text-right text-gold-700">{formatPct(r.netYTM)}</td>
                        <td className={`num py-2 text-right ${r.beatsBreakEven ? 'text-mint-700' : 'text-ink-faint'}`}>
                          {r.gapPp >= 0 ? '+' : ''}{r.gapPp.toFixed(2)} pp
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs leading-relaxed text-ink-faint">
                Candidates are priced from your{' '}
                <Link href="/prices/" className="text-gold-700 underline underline-offset-2">
                  price book
                </Link>{' '}
                where you have recorded one, and at par <span className="num">100</span> where you
                have not — par flatters them, so a bond that only just clears the bar here may not
                clear it in reality.
              </p>
            </div>

            <div className="card space-y-1">
              <h2 className="font-display text-sm font-bold text-ink-soft">
                What you are giving up
              </h2>
              <p className="text-[12px] leading-relaxed text-ink-muted">
                Holding to maturity would pay you{' '}
                <span className="num font-semibold text-ink">{formatKES(analysis.totalNetCouponsKES)}</span>{' '}
                in coupons after tax, plus{' '}
                <span className="num font-semibold text-ink">{formatKES(analysis.principalReturnedKES)}</span>{' '}
                of principal — <span className="num">{formatKES(analysis.totalIfHeldKES)}</span> in
                all, spread over {analysis.cashflows.length}{' '}
                {plural(analysis.cashflows.length, 'payment')}. Selling converts that into{' '}
                <span className="num font-semibold text-ink">{formatKES(analysis.netProceedsKES)}</span>{' '}
                today. Those are not comparable without discounting, which is exactly what the
                break-even above does — it is the honest way to weigh the two.
              </p>
            </div>
          </div>
        ) : (
          <div className="card">
            {scheduleProblem ? (
              <p role="alert" className="text-sm text-gold-700">
                The principal repayment you entered cannot be right for this bond: its date must fall
                after the bond was issued and no later than its maturity, and the percentage must be
                above 0 and no more than 100. Correct it, or clear it if your bond has no part
                repayment.
              </p>
            ) : (
              <p className="text-sm text-ink-muted">
                Enter the value date and dirty price from your quote to see the analysis. Everything
                stays on this device.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value, hint, accent }: {
  label: string; value: string; hint?: string; accent?: boolean;
}) {
  return (
    <tr className="border-b border-sand-300/60 last:border-0">
      <td className="px-4 py-2.5">
        <span className="text-sm text-ink-muted">{label}</span>
        {hint && <p className="mt-0.5 max-w-[36ch] text-xs leading-snug text-ink-faint">{hint}</p>}
      </td>
      <td className={`num px-4 py-2.5 text-right text-sm font-semibold ${accent ? 'text-base text-gold-700' : 'text-ink'}`}>
        {value}
      </td>
    </tr>
  );
}
