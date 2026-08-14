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

  /** A table, list or definition list — any of them counts as the numbers in text. */
  const hasTextEquivalent = (src: string) =>
    /<table[\s>]/.test(src) || /<ul[\s>]/.test(src) || /<dl[\s>]/.test(src);

  it.each(chartFiles.map((f) => [f.slice(SRC.length + 1), f]))(
    '%s has its plotted values in text, here or in the component that renders it',
    (_label, file) => {
      const src = readFileSync(file, 'utf8');
      if (hasTextEquivalent(src)) return;

      /* The equivalent may live one level up, and since Recharts was deferred
       * it usually does. Each chart is now a `*Plot` file holding only the
       * drawing, dynamically imported by a parent that keeps the table or list
       * — deliberately, so the text stays in the page's own chunk instead of
       * waiting on the chart bundle.
       *
       * This test asserted the equivalent sat in the SAME file, and went red on
       * all four plots the moment they were split. It was right that something
       * had changed and wrong about what the rule was: the requirement is that
       * a reader can get the numbers as text, not that a particular file
       * contains them. So it now follows the import. */
      const base = file.split('/').pop()!.replace('.tsx', '');
      const importers = tsxFiles(SRC).filter(
        (f) => f !== file && new RegExp(`['"./]${base}['"]`).test(readFileSync(f, 'utf8'))
      );
      const covered = importers.filter((f) => hasTextEquivalent(readFileSync(f, 'utf8')));

      expect(
        covered.length,
        `${base} plots data with Recharts and renders no table or list. Recharts ` +
          `output is positioned SVG paths — a screen reader gets nothing from it. ` +
          `Neither does any of the ${importers.length} component(s) that render it: ` +
          `${importers.map((f) => f.slice(SRC.length + 1)).join(', ') || 'none found'}. ` +
          `Put the numbers in text, here or there.`
      ).toBeGreaterThan(0);
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
