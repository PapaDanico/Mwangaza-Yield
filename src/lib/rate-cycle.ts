import type { RateDecision } from '@/types/bond';

/**
 * Reading Kenya's policy-rate cycle from CBK's own MPC decisions.
 *
 * A single number — "CBR 8.75%" — tells a saver nothing. What they actually
 * need to know before committing money for ten years is where that number has
 * come from and which way it is heading, because the policy rate is the anchor
 * the whole yield curve is priced against.
 *
 * Everything here is derived arithmetic over published decisions. No forecast,
 * no view, no opinion about what CBK will do next.
 */

export type CyclePhase = 'easing' | 'tightening' | 'holding';

export interface RateCycle {
  current: number;
  currentDate: string;
  /**
   * Where the CURRENT run began — the level just before the first move of the
   * present easing or tightening cycle.
   *
   * This is deliberately not the all-time high. Kenya's record CBR of 18.00%
   * was set in December 2011; saying today's 8.75% is "9.25 points off the
   * peak" would describe a single easing that never happened, across three
   * separate cycles and fifteen years. The honest comparison is against the
   * level this run started from.
   */
  cycleStart: number;
  cycleStartDate: string;
  /** All-time extremes, kept separately and labelled as history, not as cycle. */
  recordHigh: number;
  recordHighDate: string;
  recordLow: number;
  recordLowDate: string;
  /** The most recent decision that actually moved the rate. */
  lastChange: RateDecision | null;
  /** Consecutive same-direction moves ending at that change, and their total. */
  runLength: number;
  runBps: number;
  /** Meetings since the last move — a pause is itself a signal. */
  holdsSince: number;
  phase: CyclePhase;
}

/** Decisions from the last `years` years, oldest first. */
export function recentDecisions(decisions: RateDecision[], years: number): RateDecision[] {
  if (!decisions.length) return [];
  const sorted = [...decisions].sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = new Date(sorted[sorted.length - 1].date);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const iso = cutoff.toISOString().slice(0, 10);
  const window = sorted.filter((d) => d.date >= iso);
  // Always keep one point before the window so the first segment has a start.
  const firstIdx = sorted.indexOf(window[0]);
  return firstIdx > 0 ? [sorted[firstIdx - 1], ...window] : window;
}

export function analyseCycle(decisions: RateDecision[]): RateCycle | null {
  if (!decisions.length) return null;
  const sorted = [...decisions].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];

  let recordHigh = sorted[0];
  let recordLow = sorted[0];
  for (const d of sorted) {
    if (d.rate > recordHigh.rate) recordHigh = d;
    if (d.rate < recordLow.rate) recordLow = d;
  }

  // Walk back to the last decision that actually moved the rate.
  let lastChangeIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].changeBps !== 0 && sorted[i].move !== 'start') {
      lastChangeIdx = i;
      break;
    }
  }

  let runLength = 0;
  let runBps = 0;
  let runStartIdx = lastChangeIdx;
  if (lastChangeIdx >= 0) {
    const sign = Math.sign(sorted[lastChangeIdx].changeBps);
    // Holds do not break a run — CBK pausing mid-cycle then resuming is still
    // one easing cycle — but a move the other way does.
    for (let i = lastChangeIdx; i >= 0; i--) {
      const bps = sorted[i].changeBps;
      if (bps === 0) continue;
      if (Math.sign(bps) !== sign) break;
      runLength++;
      runBps += bps;
      runStartIdx = i;
    }
  }

  // The level the run started FROM is the one before its first move.
  const beforeRun = runStartIdx > 0 ? sorted[runStartIdx - 1] : sorted[0];

  const holdsSince = lastChangeIdx >= 0 ? sorted.length - 1 - lastChangeIdx : 0;
  const lastChange = lastChangeIdx >= 0 ? sorted[lastChangeIdx] : null;

  let phase: CyclePhase;
  if (!lastChange || holdsSince >= 2) phase = 'holding';
  else phase = lastChange.changeBps < 0 ? 'easing' : 'tightening';

  return {
    current: latest.rate,
    currentDate: latest.date,
    cycleStart: beforeRun.rate,
    cycleStartDate: beforeRun.date,
    recordHigh: recordHigh.rate,
    recordHighDate: recordHigh.date,
    recordLow: recordLow.rate,
    recordLowDate: recordLow.date,
    lastChange,
    runLength,
    runBps,
    holdsSince,
    phase,
  };
}

const PHASE_LABEL: Record<CyclePhase, string> = {
  easing: 'Easing cycle',
  tightening: 'Tightening cycle',
  holding: 'On hold',
};

export function phaseLabel(phase: CyclePhase): string {
  return PHASE_LABEL[phase];
}

/** Plain-language description of where the cycle stands. Facts only. */
export function describeCycle(c: RateCycle): string {
  const pts = (bps: number) => `${(Math.abs(bps) / 100).toFixed(2)} percentage points`;
  const meetings = (n: number) => (n === 1 ? '1 meeting' : `${n} meetings`);

  if (!c.lastChange) {
    return `The Central Bank Rate stands at ${c.current.toFixed(2)}%.`;
  }

  const direction = c.runBps < 0 ? 'cuts' : 'increases';
  const run =
    c.runLength > 1
      ? `${c.runLength} consecutive ${direction} totalling ${pts(c.runBps)}`
      : `a single ${c.runBps < 0 ? 'cut' : 'rise'} of ${pts(c.runBps)}`;
  const from = `from ${c.cycleStart.toFixed(2)}% in ${monthYear(c.cycleStartDate)}`;

  if (c.phase === 'holding') {
    return `The Central Bank Rate has been held at ${c.current.toFixed(2)}% for ${meetings(c.holdsSince)}, after ${run} ${from}.`;
  }
  return `The Central Bank Rate is at ${c.current.toFixed(2)}%, following ${run} ${from}.`;
}

/**
 * What a falling or rising policy rate means for someone deciding today.
 *
 * This states the mechanism, not a recommendation: policy rates anchor the
 * curve, so the direction of travel changes what a long bond is worth relative
 * to reinvesting later. The user draws their own conclusion.
 */
export function whatItMeans(c: RateCycle): string {
  if (c.phase === 'tightening') {
    return 'When the policy rate is rising, new issues tend to come at higher yields and existing bonds lose value on the secondary market. Money kept short can be reinvested at those higher rates later.';
  }
  if (c.phase === 'easing') {
    return 'When the policy rate is falling, new issues tend to come at lower yields — so a long bond bought today locks in a rate that may not be on offer next year. That is the trade-off behind "should I go long now?".';
  }
  return 'With the rate on hold, the market is waiting. Yields on offer today are close to what recent auctions cleared at, which makes tenor — not timing — the decision that matters most.';
}

export function monthYear(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
