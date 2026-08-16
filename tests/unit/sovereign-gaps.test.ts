/**
 * The gap notice has to appear for the right reason and, more importantly,
 * has to STOP appearing on its own.
 *
 * A hard-coded "we don't have debt to GDP" paragraph would be correct today
 * and wrong the moment the figure starts arriving — and wrong in the worst
 * direction, telling a reader a number is unavailable while it sat on screen
 * a few pixels above. `probe_treasury_debt.py` exists precisely to make that
 * day happen, and the National Treasury bulletin is already a permitted
 * source, so this is a scheduled change rather than a hypothetical one.
 *
 * The retirement case below is the one that matters. The rest is scaffolding.
 */
import { describe, it, expect } from 'vitest';
import { sovereignGaps, DEBT_TO_GDP_LABEL } from '../../src/lib/sovereign-gaps';
import type { ContextIndicator } from '../../src/types/bond';

const indicator = (label: string): ContextIndicator => ({
  id: label.toLowerCase().replace(/[^a-z]+/g, '-'),
  label,
  value: 1,
  unit: '%',
  asOf: '2025',
  source: 'World Bank Open Data (CC BY 4.0)',
  sourceUrl: 'https://data.worldbank.org',
  note: 'a note',
  sentiment: 'good',
});

/** The seven that actually arrive, as context.json holds them today. */
const ARRIVING = [
  'GDP growth',
  'Reserves (import cover)',
  'Exports / GDP',
  'Current account / GDP',
  'Interest / government revenue',
  'External debt / GNI',
  'Debt service / exports',
].map(indicator);

describe('sovereignGaps', () => {
  it('names debt to GDP when the seven that arrive do not include it', () => {
    const gaps = sovereignGaps(ARRIVING);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].label).toBe(DEBT_TO_GDP_LABEL);
  });

  it('retires itself once the figure starts arriving', () => {
    // The whole reason this is computed rather than written into the JSX.
    expect(sovereignGaps([...ARRIVING, indicator(DEBT_TO_GDP_LABEL)])).toEqual([]);
  });

  it('says nothing while the store is still empty', () => {
    // A cold load is not a missing indicator. Reporting one here would put a
    // gap notice on the first paint of every visit.
    expect(sovereignGaps([])).toEqual([]);
  });

  it('tells the reader why it is missing and where to get it', () => {
    // A bare "not available" invites the reader to assume we forgot. The two
    // facts that make it useful are that the request succeeds and comes back
    // empty, and that the National Treasury publishes the figure itself.
    const [gap] = sovereignGaps(ARRIVING);
    expect(gap.why).toMatch(/World Bank/);
    expect(gap.why).toMatch(/empty|no observation/);
    expect(gap.where).toMatch(/National Treasury/);
  });

  it('matches the label worldbank.py actually writes', () => {
    // The gap is detected by label because the indicator code does not survive
    // into context.json. If the scraper's label is ever reworded, this pairing
    // breaks silently and the notice would show beside a row that is present.
    expect(DEBT_TO_GDP_LABEL).toBe('Government debt / GDP');
  });
});
