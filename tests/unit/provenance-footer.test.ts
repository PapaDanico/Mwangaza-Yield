import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { latestFigureDate } from '../../src/lib/data-freshness';
import meta from '../../public/data/meta.json';
import freshness from '../../public/data/freshness.json';

const ROOT = process.cwd() + '/';

describe('the provenance footer tells readers about the DATA, not the pipeline', () => {
  it('names the newest reader-facing figure', () => {
    const expected = (freshness.datasets as { file: string; asOf: string }[])
      .filter((d) => d.file !== 'meta.json')
      .map((d) => d.asOf.slice(0, 10))
      .sort()
      .pop();
    expect(latestFigureDate()).toBe(expected);
  });

  it('does not use the pipeline timestamp', () => {
    // meta.generatedAt means "the pipeline ran". It sat in this footer as
    // "Last sync" on every page, five weeks old, above figures from the day
    // before — see DataProvenanceFooter.tsx.
    const src = readFileSync(`${ROOT}src/components/shared/DataProvenanceFooter.tsx`, 'utf8');
    expect(src).not.toMatch(/from ['"][^'"]*meta\.json['"]/);
    expect(latestFigureDate()).not.toBe(meta.generatedAt.slice(0, 10));
  });
});
