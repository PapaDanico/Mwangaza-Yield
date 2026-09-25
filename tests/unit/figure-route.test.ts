import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { provenanceOf } from '../../src/lib/figure-route';

describe('provenance', () => {
  it('names every route macro.json actually uses', () => {
    const rows = JSON.parse(readFileSync(`${process.cwd()}/public/data/macro.json`, 'utf8')) as { via?: string }[];
    for (const r of rows) if (r.via) expect(provenanceOf(r.via), r.via).not.toBeNull();
  });
  it('shows nothing for an unknown or missing route rather than guessing', () => {
    expect(provenanceOf(undefined)).toBeNull();
    expect(provenanceOf('something-new')).toBeNull();
  });
  it('never presents a search fallback as primary', () => {
    expect(provenanceOf('search-corroborated')?.tone).toBe('secondary');
  });
});
