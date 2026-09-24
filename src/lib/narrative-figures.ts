/**
 * Figures the prose quotes, computed from the data at build time.
 *
 * The disclaimer, FAQ and Learn pages each said "at 6.4% inflation, a 12% net
 * yield is roughly 5.6% real" — a CPI print months old by 24 September, when
 * August's was 6.6%. Worse, 5.6% is 12 − 6.4: SUBTRACTION, on the same site
 * whose FAQ teaches, two answers later, that you must divide. Three pages
 * contradicted a lesson one of them was teaching.
 *
 * Typed numbers in prose go stale on the next data release and nobody is told.
 * These read the committed macro.json, so the sentences move when the CPI does
 * and cannot drift from the figure the rest of the site shows.
 */
import macro from '../../public/data/macro.json';
import { realRate } from './real-yield';

interface Row { indicator: string; value: number; date: string; period?: string }

function latest(indicator: string): Row | null {
  const rows = (macro as Row[])
    .filter((r) => r.indicator === indicator && Number.isFinite(r.value))
    .sort((a, b) => b.date.localeCompare(a.date));
  return rows[0] ?? null;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Headline CPI as a percentage, with the month it describes. Null if absent. */
export function cpiNow(): { pct: number; label: string } | null {
  const r = latest('CPI');
  if (!r) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(r.period ?? '');
  const label = m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : r.date.slice(0, 7);
  return { pct: r.value, label };
}

/** A net yield in real terms at today's CPI, by division, to two places. */
export function realAtCpi(netPct: number): number | null {
  const c = cpiNow();
  return c ? Number(realRate(netPct, c.pct).toFixed(2)) : null;
}

/** "at X% inflation (Month YYYY), a N% net yield is about R% in real terms" */
export function realSentence(netPct: number): string {
  const c = cpiNow();
  const r = realAtCpi(netPct);
  if (!c || r === null) return `a ${netPct}% net yield loses purchasing power to inflation`;
  return `at ${c.pct}% inflation (${c.label}), a ${netPct}% net yield is about ${r.toFixed(1)}% in real terms`;
}
