import { describe, expect, it } from 'vitest';
import { newestRoute, provenanceOf } from '../../src/lib/figure-route';
import tbills from '../../public/data/tbills.json';
import macro from '../../public/data/macro.json';

describe('newestRoute', () => {
  it('reports the route of the newest row, across the date fields datasets use', () => {
    expect(
      newestRoute([
        { date: '2026-10-15', via: 'supplied-document' },
        { date: '2026-10-22', via: 'cbk-home' },
        { asOf: '2026-01-01', via: 'search-corroborated' },
      ])
    ).toBe('cbk-home');
  });

  it('never borrows an older row’s route when the newest has none', () => {
    expect(newestRoute([{ date: '2026-10-01', via: 'supplied-document' }, { date: '2026-10-22' }])).toBeNull();
    expect(newestRoute([])).toBeNull();
  });

  it('every route the shipped hand-maintained data uses has a reader label', () => {
    for (const rows of [tbills, macro] as unknown[][]) {
      const via = newestRoute(rows);
      expect(via).not.toBeNull();
      expect(provenanceOf(via)).not.toBeNull();
    }
  });
});
