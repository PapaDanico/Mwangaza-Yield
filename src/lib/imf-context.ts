/**
 * IMF World Economic Outlook series, as sovereign-context rows.
 *
 * WHY THIS EXISTS
 *
 * imf-outlook.json was fetched on 29 August, licensed (IMF Data terms,
 * licences.ts), and shipped — and read by no file in src/. For a month the
 * site told readers debt/GDP was unobtainable while holding the IMF's own
 * figure. This turns the file into rows the Sovereign Context panel already
 * knows how to render, READ from the file rather than copied out of it, so a
 * refreshed WEO vintage updates the page with no second place to edit.
 *
 * Only series the panel does not already carry better are emitted. GDP growth
 * and current account are in qebr-context.json as Q1 2026 ACTUALS, which beat
 * a 2025 estimate; adding the IMF's version would put two figures under one
 * heading. The IMF's contribution is what nobody else here supplies: debt,
 * the fiscal balance, the size of the economy, and the forward view.
 *
 * Every row says whether it is an outturn, an estimate or a projection. A
 * projection shown without that word is a forecast wearing a fact's clothes.
 */
import type { ContextIndicator } from '../types/bond';

export interface WeoSeries {
  id: string;
  indicator: string;
  weoSubject: string;
  unit: string;
  source: string;
  sourceUrl: string;
  vintageDate: string;
  observations: { year: number; value: number; status: 'outturn' | 'estimate' | 'projection' | string }[];
}

type Pick = 'latest-outturn' | 'latest-non-projection' | 'next-projection';

interface RowSpec {
  subject: string;
  label: string;
  unit: string;
  pick: Pick;
  digits: number;
  note: string;
  sentiment: (v: number) => ContextIndicator['sentiment'];
}

/* Labels chosen so the ones that already exist elsewhere MERGE rather than
 * duplicate: 'Government debt / GDP' is the label sovereign-gaps.ts looks for,
 * so its presence retires the "we do not have this" notice by construction. */
const SPECS: RowSpec[] = [
  {
    subject: 'GGXWDG_NGDP',
    label: 'Government debt / GDP',
    unit: '% of GDP',
    pick: 'latest-outturn',
    digits: 1,
    note: 'General government gross debt as a share of the economy. The IMF treats 55% as an indicative ceiling for emerging markets; above 70% refinancing risk rises sharply.',
    sentiment: (v) => (v > 70 ? 'caution' : v > 55 ? 'watch' : 'good'),
  },
  {
    subject: 'GGXCNL_NGDP',
    label: 'Fiscal balance / GDP',
    unit: '% of GDP',
    pick: 'latest-non-projection',
    digits: 1,
    note: 'Government revenue minus spending, as a share of GDP. A deficit is what the Treasury must borrow — the supply every bond auction on this site is selling.',
    sentiment: (v) => (v < -5 ? 'caution' : v < -3 ? 'watch' : 'good'),
  },
  {
    subject: 'NGDPD',
    label: 'Nominal GDP',
    unit: 'US$ bn',
    pick: 'latest-non-projection',
    digits: 1,
    note: 'The size of the economy in dollars — the denominator every debt ratio on this page divides by.',
    sentiment: () => 'good',
  },
  {
    subject: 'NGDPDPC',
    label: 'GDP per capita',
    unit: 'US$',
    pick: 'latest-non-projection',
    digits: 0,
    note: 'Output per person. It moves with growth and the shilling together, so a strong year can shrink in dollars if the currency weakens.',
    sentiment: () => 'good',
  },
  {
    subject: 'NGDP_RPCH',
    label: 'GDP growth outlook',
    unit: '% y/y',
    pick: 'next-projection',
    digits: 1,
    note: "The IMF's projection for the coming year — a forecast, not a measurement, and it will be revised.",
    sentiment: (v) => (v >= 5 ? 'good' : v >= 4 ? 'watch' : 'caution'),
  },
  {
    subject: 'PCPIPCH',
    label: 'Inflation outlook',
    unit: '% (annual avg)',
    pick: 'next-projection',
    digits: 1,
    note: "The IMF's projected average inflation for the coming year. CBK targets 5% ± 2.5; a bond's real return is its yield less this.",
    sentiment: (v) => (v <= 7.5 && v >= 2.5 ? 'good' : 'caution'),
  },
];

function choose(obs: WeoSeries['observations'], pick: Pick, asOfYear: number) {
  const sorted = [...obs].sort((a, b) => a.year - b.year);
  if (pick === 'latest-outturn') return [...sorted].reverse().find((o) => o.status === 'outturn') ?? null;
  if (pick === 'latest-non-projection') return [...sorted].reverse().find((o) => o.status !== 'projection') ?? null;
  return sorted.find((o) => o.status === 'projection' && o.year >= asOfYear) ?? null;
}

const STATUS_WORD: Record<string, string> = {
  outturn: 'outturn',
  estimate: 'IMF estimate',
  projection: 'IMF projection',
};

/**
 * Rows for the Sovereign Context panel, from the WEO series the site holds.
 *
 * `asOfYear` picks "the coming year" for the outlook rows; it is passed in
 * rather than read from the clock so the output is deterministic under test
 * and in the static build.
 */
export function imfContextRows(series: WeoSeries[], asOfYear: number): ContextIndicator[] {
  const bySubject = new Map(series.map((s) => [s.weoSubject, s]));
  const rows: ContextIndicator[] = [];
  for (const spec of SPECS) {
    const s = bySubject.get(spec.subject);
    if (!s) continue; // absent series contributes nothing — never a zero
    const o = choose(s.observations, spec.pick, asOfYear);
    if (!o || !Number.isFinite(o.value)) continue;
    const value = Number(o.value.toFixed(spec.digits));
    rows.push({
      id: `imf-${spec.subject.toLowerCase()}`,
      label: spec.label,
      value,
      unit: spec.unit,
      asOf: String(o.year),
      source: `${s.source} (${STATUS_WORD[o.status] ?? o.status}, ${o.year})`,
      sourceUrl: s.sourceUrl,
      note: spec.note,
      sentiment: spec.sentiment(value),
    });
  }
  return rows;
}
