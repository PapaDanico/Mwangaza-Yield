'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { outstanding } from '@/lib/outstanding';
import { resolvePrice } from '@/lib/prices';
import { breakEvenBillRate, billRateSensitivity, compareBillWithBond } from '@/lib/tbill-vs-bond';
import { formatKES, formatPct } from '@/lib/financial-engine';
import { inputCls, labelCls } from '@/lib/field-styles';
import { nonNegativeNumber } from '@/lib/utils';
import { PriceBadge } from '@/components/shared/PriceProvenance';
import type { TBill } from '@/types/bond';

const pp = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;
const yearsLabel = (y: number) => `${y.toFixed(1)} year${y.toFixed(1) === '1.0' ? '' : 's'}`;

/**
 * Bill or bond? What rolling 91-day bills would have to earn to beat a bond.
 *
 * A bond looks better than a bill on headline rate and the comparison stops
 * there. The missing half is that a bill must be re-bought at whatever rate the
 * market then offers, so the honest answer is the AVERAGE short rate at which
 * the two come out equal. The maths and its refusals are in
 * `lib/tbill-vs-bond.ts`; this lays it out, labels the price it rests on, and
 * says in words that the short rate is a scenario and not a forecast.
 */
export default function BillOrBond({ tbills }: { tbills: TBill[] }) {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  const userPrices = usePriceStore((s) => s.userPrices);

  const choices = useMemo(
    () => outstanding(bonds.filter((b) => b.category === 'FXD' || b.category === 'SDB' || b.category === 'IFB')).sort((a, b) => a.maturityDate.localeCompare(b.maturityDate)),
    [bonds],
  );
  const bill91 = tbills.find((b) => b.tenorDays === 91) ?? tbills.slice().sort((a, b) => a.tenorDays - b.tenorDays)[0];

  const [isin, setIsin] = useState<string | null>(null);
  const [face, setFace] = useState(1_000_000);
  const [quote, setQuote] = useState('');
  const [rate, setRate] = useState<string>('');

  // Default to a bond roughly five years out, the tenor where the choice is real.
  const fiveYears = Date.now() + 5 * 365 * 86_400_000;
  const bond = choices.find((b) => b.isin === isin)
    ?? choices.reduce<typeof choices[number] | undefined>((best, b) => (!best || Math.abs(new Date(b.maturityDate).getTime() - fiveYears) < Math.abs(new Date(best.maturityDate).getTime() - fiveYears) ? b : best), undefined);

  const info = useMemo(() => (bond ? resolvePrice(bond, secondary, userPrices) : null), [bond, secondary, userPrices]);
  const typed = quote.trim() === '' ? null : nonNegativeNumber(quote, NaN);
  const price = typed != null && Number.isFinite(typed) ? typed : info?.price ?? null;
  const assumed = rate.trim() === '' ? bill91?.discountRate ?? null : nonNegativeNumber(rate, NaN);

  const model = useMemo(() => {
    if (!bond || price == null || assumed == null || !Number.isFinite(assumed) || !(assumed > 0)) return null;
    const base = { bond, cleanPrice: price, faceValueKES: face, settlement: new Date() };
    const now = compareBillWithBond({ ...base, billRatePct: assumed });
    if (!now) return null;
    const be = breakEvenBillRate(base);
    const around = [-2, 0, 2, 4, 6].map((d) => Math.max(0.5, assumed + d));
    const rows = billRateSensitivity(base, around);
    return { now, be, rows };
  }, [bond, price, assumed, face]);

  if (!bond || !bill91) return null;
  const atPar = info?.source === 'par' && typed == null;

  return (
    <details className="group rounded-xl border border-sand-200 bg-sand-50/60 px-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink marker:content-none">
        Bill or bond? What rolling bills would have to earn to beat a bond
        <span aria-hidden className="text-lg text-gold-700 transition-transform group-open:rotate-45">+</span>
      </summary>

      <div className="space-y-4 pb-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          A bond locks its yield for its whole life. A bill must be bought again every few months at whatever rate the market then
          pays. So the useful question is not &ldquo;8.7% or 13%?&rdquo; but &ldquo;how high would short rates have to average to
          make rolling bills the better deal?&rdquo;
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="bob-bond" className={labelCls}>Bond</label>
            <select id="bob-bond" className={inputCls} value={bond.isin} onChange={(e) => { setIsin(e.target.value); setQuote(''); }}>
              {choices.map((b) => (
                <option key={b.isin} value={b.isin}>{b.issueCode} · matures {b.maturityDate}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bob-face" className={labelCls}>Amount (face value, KSh)</label>
            <input id="bob-face" inputMode="numeric" className={inputCls} value={face} onChange={(e) => setFace(nonNegativeNumber(e.target.value.replace(/,/g, ''), 0))} />
          </div>
          <div>
            <label htmlFor="bob-price" className={labelCls}>
              Price you were quoted, per 100 {info && <PriceBadge info={typed != null ? { ...info, source: 'user' } : info} className="ml-1" />}
            </label>
            <input id="bob-price" inputMode="decimal" className={inputCls} placeholder={info ? info.price.toFixed(2) : '100.00'} value={quote} onChange={(e) => setQuote(e.target.value)} />
          </div>
          <div>
            <label htmlFor="bob-rate" className={labelCls}>Average 91-day bill rate you assume, % a year</label>
            <input id="bob-rate" inputMode="decimal" className={inputCls} placeholder={bill91.discountRate.toFixed(2)} value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
        </div>

        {atPar && (
          <p className="rounded-xl border border-gold-300/60 bg-gold-500/[0.06] p-3 text-sm leading-relaxed text-ink">
            No price is held for this bond, so 100 is a placeholder, not the market. A real quote changes the answer: enter the price
            you were quoted above.
          </p>
        )}

        {!model && <p className="text-sm text-ink-soft">Enter an amount, a price and a rate above zero to compare.</p>}

        {model && (
          <>
            <p className="text-sm leading-relaxed text-ink">
              Held to maturity in <strong>{yearsLabel(model.now.years)}</strong>, this bond grows your money by{' '}
              <strong>{formatPct(model.now.bond.realisedYieldPct)}</strong> a year after tax, with coupons reinvested in bills.
              Rolling 91-day bills at {formatPct(assumed ?? 0)} grows it by <strong>{formatPct(model.now.bills.netYieldPct)}</strong>.{' '}
              {model.be != null ? (
                <>
                  Rolling bills only wins if short rates <strong>average above about {formatPct(model.be)}</strong> over those years.
                </>
              ) : (
                <>There is no short rate in a plausible range at which rolling bills catches this bond.</>
              )}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Bond against rolling 91-day bills at several assumed short rates, after tax, annualised</caption>
                <thead>
                  <tr className="border-b border-sand-300 text-xs text-ink-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">If short rates average</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Bills</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Bond</th>
                    <th scope="col" className="py-2 text-right font-medium">Better</th>
                  </tr>
                </thead>
                <tbody>
                  {model.rows.map((r) => (
                    <tr key={r.billRatePct} className="border-b border-sand-200 last:border-0">
                      <th scope="row" className="num py-1.5 pr-3 font-medium text-ink">{formatPct(r.billRatePct)}</th>
                      <td className="num py-1.5 pr-3 text-right text-ink">{formatPct(r.billsYieldPct)}</td>
                      <td className="num py-1.5 pr-3 text-right text-ink">{formatPct(r.bondYieldPct)}</td>
                      <td className="py-1.5 text-right text-ink-soft">
                        {r.winner === 'tie' ? 'Level' : r.winner === 'bond' ? `Bond (${pp(r.advantagePp)} pts)` : `Bills (${pp(-r.advantagePp)} pts)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs leading-relaxed text-ink-faint">
              The contract itself pays {formatKES(model.now.bond.contractualNetCashKES)} in coupons and principal after tax on a cost of{' '}
              {formatKES(model.now.costKES)}; the figures above also reinvest each coupon in 91-day bills at the assumed rate, the same
              way the bills side is rolled, so the two are comparable. Both are after 15% withholding tax on bills and the bond&apos;s own
              rate on coupons. This is a scenario, not a forecast: nobody knows where short rates will average. It assumes you hold to
              maturity and pay no brokerage. If you may sell early, the price you get is unknowable in advance; see the{' '}
              <Link href="/sell/" className="text-gold-700 underline-offset-2 hover:underline">early-sale calculator</Link>.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
