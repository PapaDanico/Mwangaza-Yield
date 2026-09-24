import { describe, it, expect } from 'vitest';
import macro from '../../public/data/macro.json';
import imf from '../../public/data/imf-outlook.json';
import { sovereignGaps } from '../../src/lib/sovereign-gaps';
import { macroRegime } from '../../src/lib/macro-regime';

describe('debt/GDP comes from the IMF series the site already holds', () => {
  const row = (macro as { indicator: string; value: number; period?: string }[]).find(
    (r) => r.indicator === 'DEBT_TO_GDP'
  );
  const weo = (imf as { weoSubject: string; observations: { year: number; value: number; status: string }[] }[])
    .find((s) => s.weoSubject === 'GGXWDG_NGDP');

  it('matches the held WEO outturn exactly, not an estimate or projection', () => {
    // imf-outlook.json sat unread for a month while the page reported this
    // figure as unobtainable. The macro row must be THAT series, not a copy
    // that could drift from it.
    expect(row).toBeDefined();
    const obs = weo!.observations.find((o) => String(o.year) === row!.period);
    expect(obs?.status).toBe('outturn');
    expect(row!.value).toBe(obs!.value);
  });

  it('suppresses the "we do not have it" notice when the figure is held', () => {
    const ctx = [{ id: 'x', label: 'GDP growth', value: 1, unit: '%', asOf: '2025' }] as never[];
    expect(sovereignGaps(ctx, false)).toHaveLength(1);
    expect(sovereignGaps(ctx, true)).toHaveLength(0);
  });

  it('makes the verdict more cautious, never more confident', () => {
    // Absence contributes nothing; a debt level above the IMF's 55% ceiling
    // must add a caution tag, not a reassuring one.
    const without = macroRegime(8.75, 6.6, null, null, 'neutral');
    const withDebt = macroRegime(8.75, 6.6, row!.value, null, 'neutral');
    const mint = (r: typeof without) => r.tags.filter((t) => t.color.includes('mint')).length;
    expect(mint(withDebt)).toBe(mint(without));
    expect(withDebt.tags.map((t) => t.text)).toContain('Moderate debt pressure');
  });
});
