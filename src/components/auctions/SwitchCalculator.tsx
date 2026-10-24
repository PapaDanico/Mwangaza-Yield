'use client';

/**
 * "Should I switch?" for an open switch auction.
 *
 * The prospectus gives a price for the bond you hold and a yield to bid on the
 * one you would get. This runs both paths to the same date, taxes each at its
 * own rate, and says which leaves more money. The arithmetic is in
 * `src/lib/switch.ts`, pinned to CBK's own worked example.
 */

import { useMemo, useState } from 'react';
import { Repeat } from 'lucide-react';
import type { AuctionPrint, AuctionSchedule, Bond } from '@/types/bond';
import { analyseSwitch } from '@/lib/switch';
import { formatKES } from '@/lib/financial-engine';
import { normaliseCode } from '@/lib/auction-history';
import { cn } from '@/lib/utils';

const pct = (v: number) => `${v.toFixed(2)}%`;
// Amounts are labelled once, under the table, so the cells carry digits alone and fit a phone.
const kes = (v: number) => formatKES(v).replace('Ksh ', '');

export function SwitchCalculator({
  auction,
  bonds,
  prints,
}: {
  auction: AuctionSchedule;
  bonds: Bond[];
  prints: AuctionPrint[];
}) {
  const destCode = auction.issueCode.split('→').pop()?.trim() ?? '';
  const dest = bonds.find((b) => normaliseCode(b.issueCode) === normaliseCode(destCode));
  const sources = (auction.switchSources ?? [])
    .map((s) => ({ ...s, bond: bonds.find((b) => normaliseCode(b.issueCode) === normaliseCode(s.issueCode)) }))
    .filter((s): s is typeof s & { bond: Bond } => !!s.bond);

  // Default bid: where this bond last cleared, which is the best guide the
  // archive holds. The reader can overwrite it.
  const lastPrint = useMemo(
    () =>
      prints
        .filter((p) => normaliseCode(p.issueCode) === normaliseCode(destCode) && p.weightedAverageRate)
        .sort((a, b) => b.auctionDate.localeCompare(a.auctionDate))[0],
    [prints, destCode]
  );

  const [face, setFace] = useState(1_000_000);
  const [bid, setBid] = useState(lastPrint?.weightedAverageRate ?? dest?.couponRate ?? 12);
  const [reinvest, setReinvest] = useState(8.5);
  const [srcIdx, setSrcIdx] = useState(0);

  const src = sources[srcIdx];
  const result = useMemo(() => {
    if (!dest || !src || !(face > 0) || !(bid > 0)) return null;
    return analyseSwitch({
      source: src.bond,
      dest,
      sourceFaceKES: face,
      settlement: auction.settlementDate,
      sourcePricePer100: src.pricePer100,
      destYieldPct: bid,
      reinvestPct: reinvest,
    });
  }, [dest, src, face, bid, reinvest, auction.settlementDate]);

  if (!dest || !src) return null;

  const favours = result && result.advantageKES >= 0 ? 'switch' : 'keep';

  return (
    <section className="rounded-xl border border-sand-200 bg-sand-50 p-4 space-y-3" aria-labelledby="switch-calc">
      <h3 id="switch-calc" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Repeat size={16} className="text-gold-700" aria-hidden /> Should I switch?
      </h3>
      <p className="text-xs text-ink-muted">
        CBK buys your <span className="num">{src.bond.issueCode}</span> at{' '}
        <span className="num">{src.pricePer100.toFixed(4)}</span> per 100 (its{' '}
        <span className="num">{pct(src.marketYieldPct)}</span> market yield) and pays you in{' '}
        <span className="num">{dest.issueCode}</span> at the yield you bid. Both paths are run to{' '}
        <span className="num">{dest.maturityDate}</span>, after withholding tax.
      </p>

      <div className="grid gap-3 sm:grid-cols-4">
        {sources.length > 1 && (
          <label className="text-xs text-ink-muted">
            Bond you hold
            <select
              className="mt-1 w-full rounded-md border border-sand-300 bg-white px-2 py-1.5 text-sm text-ink"
              value={srcIdx}
              onChange={(e) => setSrcIdx(Number(e.target.value))}
            >
              {sources.map((s, i) => (
                <option key={s.issueCode} value={i}>{s.issueCode}</option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs text-ink-muted">
          Face value you hold (KSh)
          <input
            type="number" inputMode="numeric" min={50000} step={50000}
            className="num mt-1 w-full rounded-md border border-sand-300 bg-white px-2 py-1.5 text-sm text-ink"
            value={face} onChange={(e) => setFace(Number(e.target.value))}
          />
        </label>
        <label className="text-xs text-ink-muted">
          Yield you bid on {dest.issueCode} (%)
          <input
            type="number" inputMode="decimal" step={0.05}
            className="num mt-1 w-full rounded-md border border-sand-300 bg-white px-2 py-1.5 text-sm text-ink"
            value={bid} onChange={(e) => setBid(Number(e.target.value))}
          />
        </label>
        <label className="text-xs text-ink-muted">
          Reinvest cash at, after tax (%)
          <input
            type="number" inputMode="decimal" step={0.25}
            className="num mt-1 w-full rounded-md border border-sand-300 bg-white px-2 py-1.5 text-sm text-ink"
            value={reinvest} onChange={(e) => setReinvest(Number(e.target.value))}
          />
        </label>
      </div>
      {lastPrint && (
        <p className="text-xs text-ink-faint">
          Bid defaults to where {dest.issueCode} last cleared:{' '}
          <span className="num">{pct(lastPrint.weightedAverageRate!)}</span> on{' '}
          <span className="num">{lastPrint.auctionDate}</span>.
        </p>
      )}

      {result && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="py-1.5 font-medium" scope="col"></th>
                  <th className="py-1.5 pl-2 text-right font-medium" scope="col">Keep</th>
                  <th className="py-1.5 pl-2 text-right font-medium" scope="col">Switch</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-sand-200">
                  <th scope="row" className="py-1.5 text-left font-normal text-ink-muted">Face value held</th>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{kes(face)}</td>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{kes(result.destFaceKES)}</td>
                </tr>
                <tr className="border-t border-sand-200">
                  <th scope="row" className="py-1.5 text-left font-normal text-ink-muted">Yield after tax</th>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{pct(result.keep.netYieldPct)}</td>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{pct(result.switched.netYieldPct)}</td>
                </tr>
                <tr className="border-t border-sand-200">
                  <th scope="row" className="py-1.5 text-left font-normal text-ink-muted">Withholding tax</th>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{Math.round(result.keep.whtRate * 100)}%</td>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{Math.round(result.switched.whtRate * 100)}%</td>
                </tr>
                <tr className="border-t border-sand-200">
                  <th scope="row" className="py-1.5 text-left font-normal text-ink-muted">Coupons received, net</th>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{kes(result.keep.netCouponsKES)}</td>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{kes(result.switched.netCouponsKES)}</td>
                </tr>
                <tr className="border-t border-sand-200 font-semibold text-ink">
                  <th scope="row" className="py-1.5 text-left">Worth on {result.horizon}</th>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{kes(result.keep.endValueKES)}</td>
                  <td className="num whitespace-nowrap py-1.5 pl-2 text-right">{kes(result.switched.endValueKES)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-xs text-ink-faint">Amounts in Kenya shillings.</p>
          </div>

          <p className={cn('rounded-md px-3 py-2 text-sm', favours === 'switch' ? 'bg-mint-500/10 text-ink' : 'bg-gold-500/10 text-ink')}>
            {favours === 'switch' ? 'Switching' : 'Keeping'} leaves about{' '}
            <strong className="num">{formatKES(Math.abs(result.advantageKES))}</strong> more by {result.horizon}.
            {result.breakevenReinvestPct !== null && (
              <>
                {' '}That holds as long as cash returned early could not be reinvested at more than{' '}
                <span className="num">{pct(result.breakevenReinvestPct)}</span> after tax — the rate at which the two
                end level.
              </>
            )}
          </p>
          <p className="text-xs text-ink-faint">
            Every payment either path makes before {result.horizon} is assumed reinvested at the rate above until
            then — the same rate for both, so the comparison is fair. It is an assumption, not a forecast. Switching
            is voluntary, and only unencumbered holdings as at the auction date qualify. A bid above the cut-off is
            not accepted, and the holding stays as it was.
          </p>
        </>
      )}
    </section>
  );
}
