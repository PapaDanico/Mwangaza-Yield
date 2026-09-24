import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import imf from '../../public/data/imf-outlook.json';
import { imfContextRows, type WeoSeries } from '../../src/lib/imf-context';
import { realAtCpi, cpiNow } from '../../src/lib/narrative-figures';
import { realRate } from '../../src/lib/real-yield';

const ROOT = process.cwd() + '/';

describe('prose figures come from the data, by division', () => {
  it('uses the current CPI and divides rather than subtracts', () => {
    const c = cpiNow()!;
    expect(realAtCpi(12)).toBeCloseTo(realRate(12, c.pct), 2);
    expect(realAtCpi(12)!).toBeLessThan(12 - c.pct); // division is always below subtraction
  });

  it('no page hard-codes the stale "6.4% inflation" example any more', () => {
    for (const p of ['learn', 'faq', 'disclaimer']) {
      const src = readFileSync(`${ROOT}src/app/${p}/page.tsx`, 'utf8');
      expect(src, p).not.toMatch(/6\.4% inflation|with 6\.4%/);
    }
  });
});

describe('IMF context rows are read from the held WEO file', () => {
  const rows = imfContextRows(imf as WeoSeries[], 2026);

  it('emits debt/GDP from the latest OUTTURN, under the label the gap check uses', () => {
    const d = rows.find((r) => r.label === 'Government debt / GDP')!;
    expect(d.value).toBe(67.3);
    expect(d.asOf).toBe('2024');
    expect(d.source).toMatch(/outturn/);
  });

  it('labels every projection as one', () => {
    for (const r of rows.filter((x) => x.label.includes('outlook'))) {
      expect(r.source).toMatch(/projection/);
    }
  });

  it('does not duplicate what fresher files already carry', () => {
    const labels = rows.map((r) => r.label);
    expect(labels).not.toContain('GDP growth');
    expect(labels).not.toContain('Current account / GDP');
  });

  it('contributes nothing, not zeros, for an absent series', () => {
    expect(imfContextRows([], 2026)).toEqual([]);
  });
});
