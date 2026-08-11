import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY CHART CARRIES ITS NUMBERS IN TEXT.
 *
 * Screen-reader users extract information 61.5% less accurately and spend 211%
 * more time on web data visualisations than sighted users, and a third of the
 * charts sampled were not exposed to assistive technology at all (Sharif et
 * al., ASSETS '21, n=72). Recharts emits positioned SVG paths: there is nothing
 * in the output for a screen reader to read, so a chart without a text
 * equivalent is not a hard-to-read chart, it is an absent one.
 *
 * Asserted across every Recharts consumer rather than on the one that was
 * missing it, because the next chart added will be a different file — the same
 * reason the touch-target guard scans the tree instead of the file I had just
 * fixed. A `<table>` and a list both count: RateCycle and AuctionHistory each
 * print their plotted values as a list, which is a text equivalent even though
 * it is not tabular.
 */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path));
    else if (entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

const SRC = join(process.cwd(), 'src');

const chartFiles = tsxFiles(SRC).filter((f) => /from ['"]recharts['"]/.test(readFileSync(f, 'utf8')));

describe('chart text equivalents', () => {
  it('finds the charts at all, so an empty sweep cannot pass silently', () => {
    // Without this, renaming the import or dropping Recharts would leave the
    // loop below iterating over nothing and reporting success.
    expect(chartFiles.length).toBeGreaterThanOrEqual(4);
  });

  it.each(chartFiles.map((f) => [f.slice(SRC.length + 1), f]))(
    '%s renders its plotted values as text, not only as SVG',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      const hasText = /<table[\s>]/.test(src) || /<ul[\s>]/.test(src) || /<dl[\s>]/.test(src);
      expect(
        hasText,
        'this component plots data with Recharts but renders no table or list of ' +
          'the same values. Recharts output is positioned SVG paths — a screen ' +
          'reader gets nothing from it. Add the numbers as text.'
      ).toBe(true);
    }
  );

  it('marks up the yield-curve table so a screen reader can navigate it', () => {
    // A bare grid of <td> is announced as an undifferentiated run of numbers.
    // scope= is what makes "12-year, regular 13.42%" reconstructable per cell.
    const src = readFileSync(join(SRC, 'components/dashboard/YieldCurveChart.tsx'), 'utf8');
    expect(src, 'the table needs a caption naming what it holds').toMatch(/<caption/);
    expect(src, 'column headers need scope="col"').toMatch(/scope="col"/);
    expect(src, 'the tenor cell is the row header and needs scope="row"').toMatch(/scope="row"/);
  });
});
