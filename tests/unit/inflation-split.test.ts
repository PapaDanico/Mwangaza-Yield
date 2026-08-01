import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflationSplit, whoFeelsWhat } from '../../src/lib/inflation-split';
import type { MacroIndicator } from '../../src/types/bond';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p: string) => JSON.parse(readFileSync(`${ROOT}${p}`, 'utf8'));
const MACRO: MacroIndicator[] = read('public/data/macro.json');

const at = (indicator: MacroIndicator['indicator'], value: number, date: string): MacroIndicator => ({
  id: `${indicator}-${date}`,
  indicator,
  value,
  date,
  unit: '% y/y',
  source: 'test',
});

/**
 * The split is only useful as a comparison, so the tests defend the comparison
 * rather than the two numbers.
 *
 * "Core inflation is 3.2%" shown on its own reads as reassurance, and it is
 * the half a reader would most like to believe. It must not be possible to
 * render that alone, and it must not be possible to compare two readings taken
 * in different months — which would produce a spread that is partly just the
 * passage of time.
 */
describe('the core / non-core split', () => {
  it('reads the shipped KNBS figures', () => {
    const s = inflationSplit(MACRO)!;
    expect(s, 'no split could be read from macro.json').toBeTruthy();
    expect(s.core).toBeGreaterThan(0);
    expect(s.nonCore).toBeGreaterThan(s.core);
    expect(s.spreadPp).toBeCloseTo(s.nonCore - s.core, 6);
    /* The headline must sit between the two, or one of the three is wrong —
     * it is a weighted average of them by construction. */
    expect(s.headline).toBeGreaterThan(s.core);
    expect(s.headline).toBeLessThan(s.nonCore);
  });

  it('refuses to answer with only half the comparison', () => {
    const headlineOnly = MACRO.filter((m) => m.indicator === 'CPI');
    expect(inflationSplit(headlineOnly), 'answered without the non-core leg').toBeNull();
    expect(inflationSplit([]), 'answered from nothing').toBeNull();
    expect(
      inflationSplit([at('CPI', 6.5, '2026-07-31'), at('CPI_CORE', 3.2, '2026-07-31')]),
      'answered with core but no non-core'
    ).toBeNull();
  });

  it('refuses to compare readings from different months', () => {
    /* A spread built from a June core and a July non-core is partly just the
     * month between them, and nothing on the card would say so. */
    const mixed = [
      at('CPI', 6.5, '2026-07-31'),
      at('CPI_CORE', 3.2, '2026-06-30'),
      at('CPI_NONCORE', 15.0, '2026-07-31'),
    ];
    expect(inflationSplit(mixed)).toBeNull();
  });

  it('describes who the headline is wrong for, without inventing a rate', () => {
    /* Directional by design. A personal CPI computed from spending data this
     * app does not hold would carry false precision — worse than the headline,
     * because it would look authoritative. */
    const s = inflationSplit(MACRO)!;
    const text = whoFeelsWhat(s);
    expect(text).toContain(s.nonCore.toFixed(1));
    expect(text).toContain(s.core.toFixed(1));
    expect(text, 'invented a personal inflation rate').not.toMatch(/your inflation is \d/i);
  });

  it('says the baskets agree when they do', () => {
    const calm = [
      at('CPI', 5, '2026-07-31'),
      at('CPI_CORE', 4.8, '2026-07-31'),
      at('CPI_NONCORE', 5.4, '2026-07-31'),
    ];
    expect(whoFeelsWhat(inflationSplit(calm)!)).toMatch(/moving together/i);
  });

  it('is rendered, and states the consequence for this app\'s own numbers', () => {
    /* The defect this codebase keeps finding: a derivative computed, tested and
     * wired to nothing. And rendering the split without saying that every real
     * yield here uses the HEADLINE would leave the reader to infer the part
     * that actually matters to them. */
    const ui = readFileSync(`${ROOT}src/components/dashboard/InflationSplit.tsx`, 'utf8');
    const body = ui.slice(ui.indexOf('export default function'));
    expect(body).toMatch(/split\.core/);
    expect(body).toMatch(/split\.nonCore/);
    expect(body).toMatch(/whoFeelsWhat\(split\)/);
    expect(body, 'the source and date are not shown').toMatch(/split\.source/);
    expect(body, "does not say the app's own real yields use the headline").toMatch(
      /after inflation/i
    );

    const page = readFileSync(`${ROOT}src/app/dashboard/page.tsx`, 'utf8');
    expect(page, 'the card is never placed on the dashboard').toMatch(/<InflationSplitCard \/>/);
  });

  it('keeps the split out of the three-across macro grid', () => {
    /* Five cards in a three-column grid on a 390px screen either overflow or
     * shrink every label past legibility. */
    const panel = readFileSync(`${ROOT}src/components/dashboard/MacroPanel.tsx`, 'utf8');
    expect(panel).toMatch(/HEADLINE/);
    expect(panel, 'the panel no longer filters, so the grid will carry five cards').toMatch(
      /filter\(/
    );
    expect(panel).not.toMatch(/'CPI_CORE'/);
  });
});
