import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(new URL('../../src/app/portfolio/page.tsx', import.meta.url), 'utf8');

describe('portfolio risk fallback valuation', () => {
  it('revalues known-cost holdings at today when market prices are missing', () => {
    expect(SOURCE).toMatch(
      /const currentCost = h\.costBasisKnown === false\s*\?\s*null\s*:\s*computeBondInvestment\(\s*bond,\s*h\.faceValueKES,\s*h\.purchaseCleanPrice,\s*today,\s*\);/s,
    );
    expect(SOURCE).toMatch(/const valuation = market \?\? currentCost;/);
  });
});
