import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(new URL('../../src/app/portfolio/page.tsx', import.meta.url), 'utf8');

describe('portfolio risk fallback valuation', () => {
  it('revalues known-cost holdings at today when market prices are missing', () => {
    expect(SOURCE).toContain('const currentCost = h.costBasisKnown === false');
    expect(SOURCE).toContain(': computeBondInvestment(bond, h.faceValueKES, h.purchaseCleanPrice, today);');
    expect(SOURCE).toContain('const valuation = market ?? currentCost;');
  });
});
