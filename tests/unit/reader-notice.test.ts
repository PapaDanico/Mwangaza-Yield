/**
 * The banner warns about figures, not about jobs.
 *
 * WHY THIS FILE EXISTS
 *
 * The reader-facing banner used to report pipeline liveness, and on the
 * morning of 21 August 2026 it told readers this:
 *
 *   "These figures were last updated on 2026-08-19, and 2 scheduled updates
 *    have been missed since. Auction rates move weekly, so treat anything here
 *    as indicative and check the Central Bank's own published results before
 *    acting on it."
 *
 * Every clause of that misled. The T-bill figures — the auction rates it
 * singles out — had been updated on the 20th, and freshness.json said so
 * (`tbills.json asOf 2026-08-20`). The CBR was ten days into a 130-day
 * cadence, CPI sixteen into forty-five. Nothing on the page was out of date.
 *
 * `meta.generatedAt` means "the pipeline ran". It is not "when these figures
 * were last updated", and the two diverge the moment anything is corrected by
 * hand — which is exactly how tbills.json is maintained.
 *
 * A banner that cries wolf spends the credibility it needs for the day
 * something is genuinely wrong. So these tests pin both directions: silent
 * when every figure is inside its own cadence, and specific when one is not.
 */
import { describe, it, expect } from 'vitest';
import { readerNotice } from '../../src/lib/data-freshness';
import macro from '../../public/data/macro.json';
import freshnessReport from '../../public/data/freshness.json';

/** The newest date the shipped data carries, whatever it happens to be. */
function newestMacroDate(): string {
  return (macro as { date?: string }[])
    .map((r) => r.date ?? '')
    .filter(Boolean)
    .sort()
    .reverse()[0];
}

const day = (iso: string) => new Date(`${iso}T06:00:00Z`);
const plusDays = (iso: string, n: number) =>
  new Date(new Date(`${iso}T06:00:00Z`).getTime() + n * 86_400_000);

describe('the sweep itself', () => {
  it('has data to judge, so the tests below cannot pass vacuously', () => {
    expect((macro as unknown[]).length).toBeGreaterThan(3);
    expect(freshnessReport.datasets.length).toBeGreaterThan(3);
    expect(newestMacroDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('silence is the healthy state', () => {
  it('says nothing on the day the data was published', () => {
    expect(readerNotice(day(newestMacroDate()))).toBeNull();
  });

  it('says nothing while every figure is still inside its own cadence', () => {
    // FX has the tightest budget at 4 days, so this is the binding constraint.
    expect(readerNotice(plusDays(newestMacroDate(), 3))).toBeNull();
  });

  it('never reports a pipeline outage as a figure being wrong', () => {
    // The whole defect: meta.generatedAt going stale must not, by itself,
    // produce a warning about the numbers.
    const notice = readerNotice(plusDays(newestMacroDate(), 3));
    expect(notice).toBeNull();
    const meta = freshnessReport.datasets.find((d) => d.file === 'meta.json');
    expect(meta, 'meta.json should still be tracked for the operator').toBeDefined();
  });
});

describe('it speaks when a figure is genuinely overdue', () => {
  it('names the specific figure, its age and its cadence', () => {
    const notice = readerNotice(plusDays(newestMacroDate(), 40));
    expect(notice).not.toBeNull();
    expect(notice).toContain('USD/KES');
    expect(notice, 'the reason must be stated, not just the number')
      .toContain('published every trading day');
    expect(notice).toContain('expected within 4');
  });

  it('uses reader vocabulary, never the pipeline keys', () => {
    const notice = readerNotice(plusDays(newestMacroDate(), 400)) ?? '';
    expect(notice).not.toContain('FX_USD_KES');
    expect(notice).not.toContain('CPI_CORE');
  });

  it('escalates as more figures pass their budgets', () => {
    const early = readerNotice(plusDays(newestMacroDate(), 40)) ?? '';
    const late = readerNotice(plusDays(newestMacroDate(), 200)) ?? '';
    const count = (s: string) => s.split(';').length;
    expect(count(late)).toBeGreaterThan(count(early));
  });

  it('keeps the tightest-cadence figure first to breach', () => {
    // FX at 4 days must warn before CPI at 45 — a reader should hear about the
    // daily figure long before the monthly one.
    const atTen = readerNotice(plusDays(newestMacroDate(), 10)) ?? '';
    expect(atTen).toContain('USD/KES');
    expect(atTen).not.toContain('Inflation (CPI)');
  });
});

describe('a clock that disagrees does not produce nonsense', () => {
  it('stays silent for a date before the data was published', () => {
    expect(readerNotice(plusDays(newestMacroDate(), -30))).toBeNull();
  });
});
