/**
 * The panel must show the fresher of two sources, and must never blend them.
 *
 * The figures below are the real ones as of 2026-08-16, not invented fixtures.
 * The World Bank column is what `public/data/context.json` shipped; the QEBR
 * column is what `qebr_parser.py --diagnose` extracted on a CI runner the same
 * morning:
 *
 *   indicator              World Bank        QEBR
 *   GDP growth             4.63  (2025)      4.6   (2026-03-31)
 *   Reserves import cover  4.03  (2024)      5.7   (2026-03-31)
 *   Current account / GDP  -1.29 (2024)      -3.0  (2026-03-31)
 *
 * Both stale figures flatter the borrower, which is why this is worth a guard
 * rather than a preference: reserves shown sitting on the statutory floor of
 * four when the real buffer is 5.7, and a current-account deficit shown at less
 * than half its size. A reader cannot correct for a bias that points both ways.
 */
import { describe, it, expect } from 'vitest';
import { mergeSovereign } from '../../src/lib/sovereign-merge';
import type { ContextIndicator } from '../../src/types/bond';

const row = (
  label: string,
  value: number,
  asOf: string,
  source: string
): ContextIndicator => ({
  id: `${source}-${label}`.toLowerCase().replace(/[^a-z]+/g, '-'),
  label,
  value,
  unit: '%',
  asOf,
  source,
  sourceUrl: 'https://example.test',
  note: 'a note',
  sentiment: 'watch',
});

const WB = 'World Bank Open Data (CC BY 4.0)';
const QEBR = 'National Treasury, Quarterly Economic and Budgetary Review';

const WORLD_BANK = [
  row('GDP growth', 4.63, '2025', WB),
  row('Reserves (import cover)', 4.03, '2024', WB),
  row('Exports / GDP', 15.76, '2025', WB),
  row('Current account / GDP', -1.29, '2024', WB),
  row('Interest / government revenue', 24.28, '2023', WB),
];

const TREASURY = [
  row('GDP growth', 4.6, '2026-03-31', QEBR),
  row('Reserves (import cover)', 5.7, '2026-03-31', QEBR),
  row('Current account / GDP', -3.0, '2026-03-31', QEBR),
];

describe('mergeSovereign', () => {
  it('replaces the two figures that were flattering the borrower', () => {
    const merged = mergeSovereign(WORLD_BANK, TREASURY);
    const byLabel = new Map(merged.map((r) => [r.label, r]));

    expect(byLabel.get('Reserves (import cover)')?.value).toBe(5.7);
    expect(byLabel.get('Current account / GDP')?.value).toBe(-3.0);
  });

  it('carries the whole row, not just the number', () => {
    // A value with the other source's date or note would be a figure neither
    // institution published.
    const merged = mergeSovereign(WORLD_BANK, TREASURY);
    const reserves = merged.find((r) => r.label === 'Reserves (import cover)')!;
    expect(reserves.source).toBe(QEBR);
    expect(reserves.asOf).toBe('2026-03-31');
  });

  it('leaves rows the Treasury does not publish alone', () => {
    const merged = mergeSovereign(WORLD_BANK, TREASURY);
    const interest = merged.find((r) => r.label === 'Interest / government revenue')!;
    // The oldest figure on the panel, and it stays: qebr_parser refuses it
    // because the QEBR's matches are FOREIGN interest and a revenue SHORTFALL.
    expect(interest.source).toBe(WB);
    expect(interest.asOf).toBe('2023');
  });

  it('hands a row BACK if the Treasury copy ever goes stale', () => {
    // The rule is "fresher wins", not "Treasury wins". If the QEBR stopped
    // being published the World Bank should reclaim the row, and a rule that
    // only ever moves one way would not do that.
    const staleTreasury = [row('GDP growth', 3.1, '2019-12-31', QEBR)];
    const merged = mergeSovereign(WORLD_BANK, staleTreasury);
    expect(merged.find((r) => r.label === 'GDP growth')?.source).toBe(WB);
  });

  it('compares an annual stamp against a quarterly one honestly', () => {
    // "2025" is widened to 2025-12-31 rather than compared as a raw string.
    // A 2025 annual figure is NOT older than 2025-06-30.
    const midYear = [row('Exports / GDP', 99, '2025-06-30', QEBR)];
    const merged = mergeSovereign(WORLD_BANK, midYear);
    expect(merged.find((r) => r.label === 'Exports / GDP')?.value).toBe(15.76);
  });

  it('appends a ratio only the Treasury publishes', () => {
    const extra = [row('Fiscal balance / GDP', -5.2, '2026-03-31', QEBR)];
    const merged = mergeSovereign(WORLD_BANK, extra);
    expect(merged).toHaveLength(WORLD_BANK.length + 1);
    expect(merged.at(-1)?.label).toBe('Fiscal balance / GDP');
  });

  it('is a no-op before the pipeline has ever written the second file', () => {
    // The ordinary case until refresh-data runs qebr_parser --write.
    expect(mergeSovereign(WORLD_BANK, [])).toEqual(WORLD_BANK);
    expect(mergeSovereign(WORLD_BANK)).toEqual(WORLD_BANK);
  });

  it('preserves the panel order the reader already knows', () => {
    const merged = mergeSovereign(WORLD_BANK, TREASURY);
    expect(merged.map((r) => r.label).slice(0, 5)).toEqual(
      WORLD_BANK.map((r) => r.label)
    );
  });
});
