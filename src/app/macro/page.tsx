'use client';

import { useMemo } from 'react';
import {
  Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip,
  XAxis, YAxis, BarChart, Bar, CartesianGrid,
} from 'recharts';
import { useBondStore } from '@/stores/bondStore';
import {
  sustainabilitySignal,
  trendArrow,
} from '@/lib/macro-context';
import { yearsToMaturityAt } from '@/lib/bid';
import SovereignContext from '@/components/dashboard/SovereignContext';
import { usePersistedState } from '@/lib/persisted';
import { buildMacroSummary } from '@/lib/macro-summary';

function mpcSentiment(title?: string): 'hawkish' | 'dovish' | 'neutral' {
  const t = (title || '').toLowerCase();
  if (t.includes('raise') || t.includes('hike') || t.includes('tight')) return 'hawkish';
  if (t.includes('cut') || t.includes('ease')) return 'dovish';
  return 'neutral';
}

function curveRegime(termPrem: number): { label: string; note: string; color: string } {
  if (termPrem > 2) return {
    label: 'Steep',
    note: 'Long bonds richly compensate for duration risk. Investors holding to maturity capture the full premium.',
    color: 'text-mint-700',
  };
  if (termPrem > 0) return {
    label: 'Normal',
    note: 'The curve pays a modest positive term premium. Duration adds incremental return above cash.',
    color: 'text-ink',
  };
  if (termPrem > -0.5) return {
    label: 'Flat',
    note: 'Near-zero term premium offers little reward for extending duration. Short bills may offer similar yield with less risk.',
    color: 'text-gold-700',
  };
  return {
    label: 'Inverted',
    note: 'Short rates exceed long yields — an unusual signal of market stress or aggressive policy tightening. Duration may underperform cash.',
    color: 'text-red-600',
  };
}

function macroRegime(cbr: number, cpi: number, debtToGDP: number | null, kenyaSpread: number | null, sentiment: string): {
  label: string;
  description: string;
  tags: { text: string; color: string }[];
} {
  const realRate = cbr - cpi;
  const tags: { text: string; color: string }[] = [];

  if (sentiment === 'dovish') tags.push({ text: 'Easing cycle', color: 'bg-mint-500/15 text-mint-700' });
  else if (sentiment === 'hawkish') tags.push({ text: 'Tightening cycle', color: 'bg-red-500/15 text-red-700' });
  else tags.push({ text: 'Policy on hold', color: 'bg-sand-200 text-ink-soft' });

  if (realRate > 1) tags.push({ text: 'Positive real rates', color: 'bg-mint-500/15 text-mint-700' });
  else if (realRate < 0) tags.push({ text: 'Negative real rates', color: 'bg-red-500/15 text-red-700' });

  if (debtToGDP !== null && debtToGDP > 70) tags.push({ text: 'Elevated debt burden', color: 'bg-red-500/15 text-red-700' });
  else if (debtToGDP !== null && debtToGDP > 55) tags.push({ text: 'Moderate debt pressure', color: 'bg-gold-500/15 text-gold-700' });
  else tags.push({ text: 'Debt within threshold', color: 'bg-mint-500/15 text-mint-700' });

  if (kenyaSpread !== null && kenyaSpread > 4) tags.push({ text: 'Wide spread vs. EM peers', color: 'bg-gold-500/15 text-gold-700' });
  else tags.push({ text: 'Contained spread vs. EM', color: 'bg-mint-500/15 text-mint-700' });

  const conditions = tags.filter((t) => t.color.includes('mint')).length;
  const risks = tags.filter((t) => t.color.includes('red')).length;

  let label: string;
  let description: string;
  if (conditions > risks + 1) {
    label = 'Broadly supportive for bond investors';
    description = 'Policy rates are positive in real terms and yields compensate for duration and sovereign risk. Conditions favour holding.';
  } else if (risks > conditions) {
    label = 'Elevated risk environment';
    description = 'Debt dynamics or policy signals introduce headwinds. Scrutinise duration and credit risk before extending.';
  } else {
    label = 'Mixed signals — selectivity rewarded';
    description = 'Some conditions support bonds while others introduce risk. Pricing discipline and security selection matter more than direction bets.';
  }
  return { label, description, tags };
}

export default function MacroPage() {
  const macro = useBondStore((s) => s.macro);
  const cbrHistory = useBondStore((s) => s.cbrHistory);
  const bonds = useBondStore((s) => s.bonds);
  const tbills = useBondStore((s) => s.tbills);

  const [expectedDecision, setExpectedDecision] = usePersistedState('macro:expected-decision', '');
  const summary = useMemo(() => buildMacroSummary(macro, bonds, tbills), [macro, bonds, tbills]);
  const {
    cbr,
    cpi,
    fx,
    fed,
    em,
    debt,
    prevCbr,
    prevCpi,
    prevDebt,
    realRate,
    prevRealRate,
    termPremium,
    kenyaSpread,
    shortBenchmark,
    longBenchmark,
  } = summary;
  const sustainability = sustainabilitySignal(debt.debtToGDP, debt.debtServiceRatio);

  const cbrSeries = useMemo(
    () => [...cbrHistory].sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ date: d.date.slice(0, 7), rate: d.rate, move: d.move })),
    [cbrHistory],
  );

  const debtSeries = useMemo(() => {
    const debtRows = macro.filter((m) => m.indicator === 'DEBT_TO_GDP').sort((a, b) => a.date.localeCompare(b.date));
    if (debtRows.length) return debtRows.map((m) => ({ date: m.date.slice(0, 4), value: m.value }));
    // A single synthetic "Now" point drew a one-dot trend line out of the
    // current value. With no value there is no line and no point pretending.
    return debt.debtToGDP === null ? [] : [{ date: 'Now', value: debt.debtToGDP }];
  }, [macro, debt.debtToGDP]);

  const latestDecision = [...cbrHistory].sort((a, b) => b.date.localeCompare(a.date))[0];
  const sentiment = mpcSentiment(latestDecision?.title);

  const curve = curveRegime(termPremium);
  const regime = macroRegime(cbr, cpi, debt.debtToGDP, kenyaSpread, sentiment);

  const upcomingMpc = useMemo(() => {
    const sorted = [...cbrHistory].sort((a, b) => b.date.localeCompare(a.date));
    const latestDate = new Date(sorted[0]?.date ?? new Date().toISOString());
    const meetings: Date[] = [];
    for (let i = 1; i <= 4; i += 1) {
      const d = new Date(latestDate);
      d.setDate(d.getDate() + 60 * i);
      meetings.push(d);
    }
    return meetings;
  }, [cbrHistory]);

  const now = new Date();
  const daysToNext = upcomingMpc[0]
    ? Math.max(0, Math.ceil((upcomingMpc[0].getTime() - now.getTime()) / 86_400_000))
    : null;

  const yieldCurveData = useMemo(() => {
    const asOf = new Date();

    return bonds
      .map((bond) => ({ bond, tenor: yearsToMaturityAt(bond, asOf) }))
      .filter(({ bond, tenor }) => bond.ytmGross > 0 && tenor > 0)
      .sort((a, b) => a.tenor - b.tenor)
      .slice(0, 12)
      .map(({ bond, tenor }) => ({
        label: bond.issueCode.split('/').pop() ?? '',
        y: bond.ytmGross,
        tenor,
      }));
  }, [bonds]);

  const sentimentMeta: Record<string, { label: string; color: string; note: string }> = {
    hawkish: {
      label: 'Hawkish',
      color: 'text-red-600',
      note: 'The MPC is signalling tighter policy. Rate increases raise reinvestment risk and may compress mark-to-market bond prices in the near term.',
    },
    dovish: {
      label: 'Dovish',
      color: 'text-mint-700',
      note: 'Easing signals favour duration. Falling policy rates boost existing bond prices and widen the real-rate cushion for new buyers.',
    },
    neutral: {
      label: 'Neutral',
      color: 'text-ink',
      note: 'Policy is in a holding pattern. Bond prices are anchored by carry rather than rate-move expectations.',
    },
  };

  const spilloverMeta: Record<string, { note: string }> = {
    'USD/KES': {
      note: fx > 130
        ? 'KES is under pressure. External debt serviced in dollars costs more in shilling terms, widening the current-account drag.'
        : 'KES is relatively contained. Dollar-denominated obligations are at manageable shilling cost.',
    },
    'Fed Funds': {
      note: (fed ?? 0) > 4
        ? 'US rates remain elevated, keeping global capital costly and limiting room for Kenya to lower its own rates without outflows.'
        : 'Lower US rates reduce the opportunity cost of holding Kenyan bonds versus dollar assets.',
    },
    'EM Yield': {
      note: (em ?? 0) > 8
        ? 'Broad EM yields are elevated, reflecting global risk aversion. Kenya must price competitively to attract portfolio flows.'
        : 'EM yields are contained, indicating a constructive global backdrop for frontier bond issuers.',
    },
    'KE Spread': {
      note: (kenyaSpread ?? 0) > 4
        ? `At ${(kenyaSpread ?? 0).toFixed(2)}%, Kenya's spread above global benchmarks is wide. This compensates investors for sovereign risk but signals elevated funding costs.`
        : `At ${(kenyaSpread ?? 0).toFixed(2)}%, Kenya's spread is contained, suggesting the market prices the sovereign relatively favourably.`,
    },
  };

  // US and EM legs come from indicators macro.json no longer carries — see the
  // note in macro-context.ts. A missing leg used to render as 0.00%, which
  // reads as a measured zero rather than an absence, so it is dropped instead.
  const spillovers = [
    { label: 'USD/KES', value: fx, unit: '' },
    { label: 'Fed Funds', value: fed, unit: '%' },
    { label: 'EM Yield', value: em, unit: '%' },
    { label: 'KE Spread', value: kenyaSpread, unit: '%' },
  ].filter((x): x is { label: string; value: number; unit: string } => x.value !== null);

  return (
    <div className="macro-newspaper space-y-6 rounded-2xl p-4 sm:p-5">
      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Economic Context</h1>
        <p className="text-sm text-ink-muted">Monetary policy, fiscal health, global spillovers, and market context in one view.</p>
      </div>

      {/* ── Macro regime synthesis ── */}
      <section className="card border-l-4 border-l-gold-500">
        <h2 className="font-semibold text-ink">Macro Regime</h2>
        <p className="mt-1 font-semibold text-ink">{regime.label}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{regime.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {regime.tags.map((tag) => (
            <span key={tag.text} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tag.color}`}>{tag.text}</span>
          ))}
        </div>
      </section>

      {/* ── Monetary Policy ── */}
      <section className="card">
        <h2 className="font-semibold text-ink">Monetary Policy</h2>
        <p className="mt-0.5 text-xs text-ink-faint">Central Bank Rate history — each dot is an MPC decision date.</p>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cbrSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5dfc8" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 10 }} unit="%" />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'CBR']} />
              <Line type="monotone" dataKey="rate" stroke="#0B214A" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="sr-only">
          {cbrSeries.slice(-8).map((p) => (
            <li key={p.date}>{p.date}: CBR {p.rate.toFixed(2)}%</li>
          ))}
        </ul>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Current CBR</p>
            <p className="num mt-1 text-xl font-bold text-ink">
              {cbr.toFixed(2)}%
              {trendArrow(cbr, prevCbr) && <span className="ml-1.5 text-sm font-normal text-ink-faint">{trendArrow(cbr, prevCbr)}</span>}
            </p>
            {prevCbr !== null && (
              <p className="mt-1 text-[11px] text-ink-faint">Was {prevCbr.toFixed(2)}%</p>
            )}
          </div>
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Inflation (CPI)</p>
            <p className="num mt-1 text-xl font-bold text-ink">
              {cpi.toFixed(2)}%
              {trendArrow(cpi, prevCpi) && <span className="ml-1.5 text-sm font-normal text-ink-faint">{trendArrow(cpi, prevCpi)}</span>}
            </p>
            {prevCpi !== null && (
              <p className="mt-1 text-[11px] text-ink-faint">Was {prevCpi.toFixed(2)}%</p>
            )}
          </div>
          <div className={`rounded-xl border p-3 ${realRate > 0 ? 'border-mint-300 bg-mint-500/[0.06]' : 'border-red-300 bg-red-500/[0.06]'}`}>
            <p className="text-xs text-ink-muted">Real rate (CBR − CPI)</p>
            <p className={`num mt-1 text-xl font-bold ${realRate > 0 ? 'text-mint-700' : 'text-red-600'}`}>
              {realRate > 0 ? '+' : ''}{realRate.toFixed(2)}%
              {trendArrow(realRate, prevRealRate) && <span className="ml-1.5 text-sm font-normal text-ink-faint">{trendArrow(realRate, prevRealRate)}</span>}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-ink-faint">
              {realRate > 0
                ? 'Positive — nominal yield exceeds inflation. Bond returns have real purchasing power.'
                : 'Negative — inflation is eroding real returns. Assess whether yield compensates for the shortfall.'}
            </p>
          </div>
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Latest MPC sentiment</p>
            <p className={`mt-1 font-semibold capitalize ${sentimentMeta[sentiment].color}`}>{sentimentMeta[sentiment].label}</p>
            <p className="mt-1 text-[11px] leading-snug text-ink-faint">{sentimentMeta[sentiment].note}</p>
          </div>
        </div>
      </section>

      {/* ── Fiscal Health ── */}
      {/*
        Rendered only when the figures exist. They do not today, and the
        alternative is not four cards reading "0.0%": sustainabilitySignal used
        to return GREEN for missing data, which is the most reassuring possible
        answer to the question a bond buyer most needs answered honestly.

        The World Bank returns no observation for Kenya's Government debt / GDP
        — sovereign-gaps.ts documents that, and SovereignContext below already
        tells the reader so and points at the Treasury bulletin. For two days
        this section contradicted it with a hand-typed 67.2% and a traffic
        light. Saying we do not have it, in the same words as the panel beneath,
        is the only version of this section that is true.
      */}
      {debt.debtToGDP !== null && debt.debtServiceRatio !== null && debt.fiscalSpace !== null ? (
      <section className="card">
        <h2 className="font-semibold text-ink">Fiscal Health</h2>
        <p className="mt-0.5 text-xs text-ink-faint">Debt-to-GDP trajectory. The IMF&apos;s indicative ceiling for EMs is 55%; the yellow band marks the amber zone (55–70%).</p>
        <div className="mt-3 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={debtSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5dfc8" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, Math.max(100, debt.debtToGDP + 10)]} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'Debt / GDP']} />
              <ReferenceLine y={55} stroke="#B7791F" strokeDasharray="4 3" label={{ value: 'IMF 55%', fontSize: 10, fill: '#B7791F', position: 'insideTopRight' }} />
              <ReferenceLine y={70} stroke="#dc2626" strokeDasharray="4 3" label={{ value: 'Amber 70%', fontSize: 10, fill: '#dc2626', position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="value" stroke="#B7791F" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="sr-only">
          {debtSeries.map((pt) => (
            <li key={pt.date}>{pt.date}: Debt to GDP {pt.value.toFixed(1)}%</li>
          ))}
        </ul>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className={`rounded-xl border p-3 ${debt.debtToGDP > 70 ? 'border-red-300 bg-red-500/[0.06]' : debt.debtToGDP > 55 ? 'border-gold-400 bg-gold-500/[0.06]' : 'border-sand-300'}`}>
            <p className="text-xs text-ink-muted">Debt / GDP</p>
            <p className="num mt-1 font-bold text-lg text-ink">
              {debt.debtToGDP.toFixed(1)}%
              {trendArrow(debt.debtToGDP, prevDebt) && <span className="ml-1.5 text-sm font-normal text-ink-faint">{trendArrow(debt.debtToGDP, prevDebt)}</span>}
            </p>
            <p className="mt-1 text-[11px] text-ink-faint">
              {debt.debtToGDP > 70 ? 'Above amber threshold — elevated refinancing risk.' : debt.debtToGDP > 55 ? 'Above IMF indicative ceiling of 55%.' : 'Within IMF indicative threshold.'}
            </p>
          </div>
          <div className={`rounded-xl border p-3 ${debt.debtServiceRatio > 35 ? 'border-red-300 bg-red-500/[0.06]' : debt.debtServiceRatio > 25 ? 'border-gold-400 bg-gold-500/[0.06]' : 'border-sand-300'}`}>
            <p className="text-xs text-ink-muted">Debt service ratio</p>
            <p className="num mt-1 font-bold text-lg text-ink">{debt.debtServiceRatio.toFixed(1)}%</p>
            <p className="mt-1 text-[11px] text-ink-faint">
              {debt.debtServiceRatio > 35 ? 'High share of revenue committed to debt service.' : debt.debtServiceRatio > 25 ? 'Elevated — limits fiscal flexibility.' : 'Manageable debt service burden.'}
            </p>
          </div>
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Fiscal space index</p>
            <p className="num mt-1 font-bold text-lg text-ink">{debt.fiscalSpace.toFixed(1)}</p>
            <p className="mt-1 text-[11px] text-ink-faint">Composite headroom score (0 = none, 100 = maximum). Tighter space raises rollover risk for bond holders.</p>
          </div>
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Sustainability signal</p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${sustainability === 'green' ? 'bg-mint-500/15 text-mint-700' : sustainability === 'yellow' ? 'bg-gold-500/15 text-gold-700' : 'bg-red-500/15 text-red-700'}`}>
              {sustainability === 'green' ? 'Sustainable' : sustainability === 'yellow' ? 'Under Pressure' : 'Stressed'}
            </span>
            <p className="mt-1 text-[11px] leading-snug text-ink-faint">
              {sustainability === 'green' ? 'Debt metrics within IMF guardrails.' : sustainability === 'yellow' ? 'Metrics elevated but not yet critical.' : 'Both debt and service ratios exceed comfort thresholds.'}
            </p>
          </div>
        </div>
      </section>
      ) : (
      <section className="card">
        <h2 className="font-semibold text-ink">Fiscal Health</h2>
        <p className="mt-2 text-sm text-ink-soft">
          We do not publish Kenya&apos;s debt-to-GDP ratio, and we would rather say so than
          estimate it.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          It is the measure a reader looks for first, and the one we cannot source. We ask
          the World Bank for it and Kenya has no observation in that series — the request
          succeeds and comes back empty. The National Treasury publishes the figure in its
          monthly debt bulletin, and the number quoted in the press comes from there rather
          than from us.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">
          The sovereign panel below carries the seven ratios we can source and licence,
          including external debt and debt service, which answer a narrower version of the
          same question.
        </p>
      </section>
      )}

      {/* ── Sovereign Credit Assessment ── */}
      <SovereignContext />

      {/* ── Global Spillovers ── */}
      <section className="card">
        <h2 className="font-semibold text-ink">Global Spillovers</h2>
        <p className="mt-0.5 text-xs text-ink-faint">How the global macro environment shapes Kenya&apos;s borrowing cost and capital flows.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {spillovers.map((s) => (
            <div key={s.label} className="rounded-xl border border-sand-300 bg-sand-50 p-3">
              <p className="text-xs text-ink-muted">{s.label}</p>
              <p className="num mt-0.5 text-lg font-bold text-ink">
                {s.value.toFixed(2)}{s.unit}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
                {spilloverMeta[s.label]?.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Market Context ── */}
      <section className="card">
        <h2 className="font-semibold text-ink">Market Context</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {/* Term premium */}
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Term premium</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <p className="num text-xl font-bold text-ink">{termPremium.toFixed(2)}%</p>
              <span className={`text-sm font-semibold ${curve.color}`}>{curve.label}</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{curve.note}</p>
            <div className="mt-2 border-t border-sand-200 pt-2">
              <p className="text-[11px] text-ink-faint">
                <span className="font-medium text-ink-soft">{longBenchmark?.label ?? 'Long bond yield'}:</span>{' '}
                <span className="num">{(longBenchmark?.value ?? 0).toFixed(2)}%</span>
                {'  ·  '}
                <span className="font-medium text-ink-soft">{shortBenchmark?.label ?? 'Short bill'}:</span>{' '}
                <span className="num">{(shortBenchmark?.value ?? 0).toFixed(2)}%</span>
              </p>
            </div>
          </div>

          {/* Yield curve chart */}
          <div className="rounded-xl border border-sand-300 p-3">
            <p className="text-xs text-ink-muted">Yield curve — current bonds by tenor</p>
            <div className="mt-1 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yieldCurveData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={28} />
                  <YAxis tick={{ fontSize: 9 }} unit="%" domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                  <Tooltip formatter={(v: number) => [`${v?.toFixed(2)}%`, 'YTM']} />
                  <Bar dataKey="y" fill="#0B214A" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* ── MPC Calendar ── */}
      <section className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-ink">MPC Calendar</h2>
            <p className="mt-0.5 text-xs text-ink-faint">Upcoming policy meetings — rate decisions move the entire yield curve.</p>
          </div>
          {daysToNext !== null && (
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${daysToNext <= 14 ? 'bg-red-500/15 text-red-700' : daysToNext <= 30 ? 'bg-gold-500/15 text-gold-700' : 'bg-sand-200 text-ink-soft'}`}>
              {daysToNext <= 14 ? '⚡ ' : ''}{daysToNext} days to next meeting
            </span>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {upcomingMpc.map((d, i) => {
            const days = Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
            return (
              <div key={d.toISOString()} className={`flex items-center justify-between rounded-xl border p-3 text-sm ${i === 0 ? 'border-gold-400 bg-gold-500/[0.04]' : 'border-sand-300'}`}>
                <span className="text-ink">{d.toLocaleDateString('en-KE', { dateStyle: 'medium' })}</span>
                <span className="num text-ink-soft">{days} days</span>
              </div>
            );
          })}
        </div>
        <label htmlFor="mpc-exp" className="mt-4 block text-xs font-medium text-ink-muted">
          Your expected decision for the next meeting
        </label>
        <input
          id="mpc-exp"
          value={expectedDecision}
          onChange={(e) => setExpectedDecision(e.target.value)}
          placeholder="e.g. Hold at current rate — inflation still above target"
          className="mt-1 w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
        />
        {expectedDecision && (
          <p className="mt-2 text-[11px] leading-snug text-ink-faint">
            Your view is saved on this device and will appear here on your next visit.
          </p>
        )}
      </section>
    </div>
  );
}
