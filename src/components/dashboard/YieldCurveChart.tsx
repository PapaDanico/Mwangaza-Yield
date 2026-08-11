'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { useBondStore } from '@/stores/bondStore';
import Term from '@/components/shared/Term';
import type { Bond } from '@/types/bond';
import DataState from '@/components/shared/DataState';

export default function YieldCurveChart() {
  const bonds = useBondStore((s) => s.bonds);

  // One point per tenor per family; reopens keep the most recent issue.
  const pick = (pool: Bond[]) => {
    const byTenor = new Map<number, Bond>();
    for (const b of pool) {
      const prev = byTenor.get(b.tenorYears);
      if (!prev || b.issueDate > prev.issueDate) byTenor.set(b.tenorYears, b);
    }
    return Array.from(byTenor.values());
  };
  const fxd = pick(bonds.filter((b) => !b.taxExempt));
  const ifb = pick(bonds.filter((b) => b.taxExempt));

  const points = new Map<number, { tenor: number; fxd?: number; ifb?: number; code: string }>();
  for (const b of fxd) points.set(b.tenorYears, { tenor: b.tenorYears, fxd: b.ytmGross, code: b.issueCode });
  for (const b of ifb) {
    const p = points.get(b.tenorYears) ?? { tenor: b.tenorYears, code: b.issueCode };
    // IFBs are WHT-exempt, so gross = net.
    points.set(b.tenorYears, { ...p, ifb: b.ytmGross, code: p.fxd ? p.code : b.issueCode });
  }
  const data = Array.from(points.values()).sort((a, b) => a.tenor - b.tenor);

  if (!data.length) return <DataState />;

  /* HOW OLD ARE THESE POINTS, AND WHY IT DECIDES WHAT WE MAY SAY
   *
   * `ytmGross` is not a live yield. It is the clearing yield from the last
   * auction of that particular bond, and a bond is only auctioned when the
   * government wants to borrow at that tenor — so a point is as old as the last
   * time this maturity was sold. Measured on the shipped data: twelve of the
   * twenty-three plotted points were over two years old and seven carried no
   * date at all, the oldest being February 2017 sitting on the 12-year mark.
   *
   * There is no fixing that by computing harder. A current yield needs a
   * current price, and this project holds none — we publish no market prices
   * at all — so for a bond that has not been auctioned lately the
   * honest position is that we do not know today's yield.
   *
   * What we must not do is narrate a market from it. The shape text below read
   * the 3-year point at 18.39% — which cleared in June 2024, near the peak of
   * the tightening — against a 30-year point from 2026, called the curve
   * INVERTED, and told the reader this "typically a sign the market expects
   * rates to fall" and that "locking in a long bond now is a bet on exactly
   * that". Every part of that is an artefact of comparing two different years,
   * and the last part is a forecast, which is a line this project does not
   * cross.
   *
   * So the narration is gated on the points being roughly contemporaneous. When
   * they are not, the chart says what it is showing instead of what it thinks
   * it means. */
  const ages = [...fxd, ...ifb]
    .map((b) => b.ytmAsOf)
    .filter((d): d is string => Boolean(d))
    .map((d) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
  const undated = fxd.length + ifb.length - ages.length;
  const stale = ages.filter((d) => d > 365).length;
  // Contemporaneous enough to read as a curve: nothing over a year old, and
  // nothing whose age we cannot check at all.
  const contemporaneous = ages.length > 0 && stale === 0 && undated === 0;

  // Describe the SHAPE in words, because the shape is the point and most
  // readers have never been told what to look for. Derived from the two ends
  // of the taxable curve — the comparison a saver is actually making.
  const withYield = data.filter((d) => d.fxd != null);
  const short = withYield[0];
  const long = withYield[withYield.length - 1];
  const spread =
    contemporaneous && short && long && short !== long ? long.fxd! - short.fxd! : null;
  const shape =
    spread == null
      ? null
      : spread > 1.5
        ? {
            label: 'Steep',
            text: `Long loans pay noticeably more than short ones — about ${spread.toFixed(2)} percentage points more over ${long.tenor - short.tenor} extra years. You are being paid well to commit for longer.`,
          }
        : spread > 0.4
          ? {
              label: 'Gently rising',
              text: `Longer bonds pay a little more — roughly ${spread.toFixed(2)} percentage points across ${long.tenor - short.tenor} extra years. Worth weighing that against how long you can leave the money alone.`,
            }
          : spread >= -0.4
            ? {
                label: 'Flat',
                text: 'Long bonds pay barely more than short ones. There is little reward for tying your money up, so shorter maturities are doing much the same work with more freedom.',
              }
            : {
                label: 'Inverted',
                text: 'Short bonds are paying MORE than long ones — unusual, and typically a sign the market expects rates to fall. Locking in a long bond now is a bet on exactly that.',
              };

  return (
    <div className="card">
      <h2 className="mb-1 font-semibold text-ink">
        What the government pays for different loan lengths
      </h2>
      <p className="mb-2 text-xs text-ink-faint">
        Bankers call this the <Term slug="yield-curve">yield curve</Term>. Each dot is one bond:
        how many years it runs, and what it pays.
      </p>
      {!contemporaneous && (
        // Shown whenever the dots are not from the same period, which on the
        // current data is always. A reader comparing two dots is entitled to
        // know they were not measured on the same day — and in the worst case
        // are nine years apart.
        <p className="mb-4 rounded-xl border border-gold-300 bg-gold-50 p-3 text-xs text-ink-soft">
          <span className="font-semibold text-ink">These dots are not from the same day.</span>{' '}
          Each is the yield at that bond&apos;s most recent auction, and a bond is only auctioned
          when the government chooses to borrow at that length.
          {stale > 0 && (
            <>
              {' '}
              <span className="num">{stale}</span> of{' '}
              <span className="num">{ages.length + undated}</span> are more than a year old
            </>
          )}
          {undated > 0 && (
            <>
              {stale > 0 ? ', and ' : ' '}
              <span className="num">{undated}</span> carr{undated === 1 ? 'ies' : 'y'} no auction
              date at all
            </>
          )}
          . So read each dot as &ldquo;what this bond paid when it was last sold&rdquo;, not as
          today&apos;s market. We do not describe the curve&apos;s shape while that is true,
          because a slope measured across different years says more about when each bond was
          auctioned than about what lenders want now.
        </p>
      )}
      <div className="h-64">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#E3D8BE" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="tenor" type="number" domain={['dataMin', 'dataMax']}
              tick={{ fill: '#8B8676', fontSize: 12 }} stroke="#CBBD9C"
              tickFormatter={(t) => `${t}y`}
            />
            <YAxis
              tick={{ fill: '#8B8676', fontSize: 12 }} stroke="#CBBD9C"
              tickFormatter={(v) => `${Number(v).toFixed(1)}%`} width={60} domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#FDFBF5', border: '1px solid #E3D8BE', borderRadius: 12, color: '#0A192F' }}
              labelStyle={{ color: '#8B8676' }}
              formatter={(v: number, name) => [`${v.toFixed(2)}%`, name]}
              labelFormatter={(t) => `${t}-year bond`}
            />
            <Legend
              formatter={(v) => <span style={{ color: '#31445F', fontSize: 12 }}>{v}</span>}
              iconType="plainline"
            />
            <Line
              name="Regular bonds (before tax)" type="monotone" dataKey="fxd" stroke="#D97706" strokeWidth={2.5}
              dot={{ r: 4, fill: '#D97706', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
              connectNulls
            />
            <Line
              name="Infrastructure bonds (tax-free)" type="monotone" dataKey="ifb" stroke="#059669" strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 4, fill: '#059669', strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#FDFBF5', strokeWidth: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* THE PLOTTED POINTS, AS TEXT.
       *
       * Measured, not assumed: screen-reader users extract information 61.5%
       * less accurately and spend 211% more time on web data visualisations
       * than sighted users, and a THIRD of the charts sampled were not exposed
       * to assistive technology at all (Sharif, Chintalapati, Wobbrock &
       * Reinecke, ASSETS '21, n=72). Non-exposure is the dominant failure —
       * not ambiguous colour, which this chart already handles by drawing the
       * IFB series dashed rather than merely green.
       *
       * So the fix is not a better chart, it is the same numbers in a form a
       * screen reader can navigate. Recharts emits an SVG of positioned paths;
       * there is nothing in it to read.
       *
       * Two honesty notes. The ASSETS paper ran no "chart plus table" arm, so
       * this remedy is an inference from where the failure sits, not a measured
       * recovery — the claim that its participants asked for tables was checked
       * and does not hold. And a <details> keeps the dashboard from doubling in
       * height while leaving the table in the DOM and announced as a disclosure,
       * which is exposure; `display: none` would not be.
       *
       * It is also plainly useful to sighted readers on a phone, where a
       * 256px-tall chart of twenty-odd points is not readable either. */}
      <details className="mt-4 rounded-xl border border-sand-300 bg-sand-100">
        <summary className="cursor-pointer px-3 py-3 text-xs font-medium text-ink-soft">
          Show these yields as a table
        </summary>
        <div className="overflow-x-auto px-3 pb-3">
          <table className="min-w-full whitespace-nowrap text-left text-xs">
            <caption className="sr-only">
              Yield to maturity by tenor, for regular bonds before tax and for tax-free
              infrastructure bonds. A dash means no bond of that tenor in that family.
            </caption>
            <thead>
              <tr className="text-ink-faint">
                <th scope="col" className="py-1.5 pr-4 font-semibold">Tenor</th>
                <th scope="col" className="py-1.5 pr-4 font-semibold">Regular (before tax)</th>
                <th scope="col" className="py-1.5 font-semibold">Infrastructure (tax-free)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.tenor} className="border-t border-sand-300/60 text-ink">
                  <th scope="row" className="py-1.5 pr-4 font-normal">{p.tenor}-year</th>
                  <td className="num py-1.5 pr-4">
                    {p.fxd === undefined ? '—' : `${p.fxd.toFixed(2)}%`}
                  </td>
                  <td className="num py-1.5">
                    {p.ifb === undefined ? '—' : `${p.ifb.toFixed(2)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {shape && (
        <div className="mt-4 rounded-xl border border-sand-300 bg-sand-100 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            How to read this · {shape.label}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{shape.text}</p>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        The green line sits lower but is <Term slug="withholding-tax">tax-free</Term>, so compare it
        against the gold line <em>after</em> tax rather than side by side. The{' '}
        <a href="/calculator/" className="text-gold-700 hover:underline">calculator</a> does that for
        a specific amount.
      </p>
    </div>
  );
}
