import { describe, it, expect } from 'vitest';
import { formatLadderSummary, formatPortfolioSummary, CBK_WHATSAPP_CHANNEL } from '../../src/lib/share';
import { buildLadder } from '../../src/lib/ladder';
import type { Bond } from '../../src/types/bond';

const asOf = new Date('2026-07-24');
const bond = (code: string, maturity: string, coupon: number, taxExempt = false): Bond => ({
  isin: `KE-${code}`, issueCode: code, name: code, category: taxExempt ? 'IFB' : 'FXD',
  issueDate: '2022-01-10', maturityDate: maturity, tenorYears: 10, couponRate: coupon,
  couponFrequencyPerYear: 2, ytmGross: coupon, minInvestmentKES: 50_000, taxExempt,
});

const URL = 'https://mwangazayield.netlify.app';

describe('formatLadderSummary', () => {
  const plan = buildLadder([bond('FXD1/A', '2030-06-10', 13), bond('IFB1/B', '2034-06-10', 12.9, true)], [], 2_000_000, 10, 2, asOf);
  const text = formatLadderSummary(plan, URL);

  it('leads with headline economics and the app link', () => {
    expect(text).toContain('*My Kenyan bond ladder*');
    expect(text).toMatch(/Blended net yield: \*\d+\.\d+%\*/);
    expect(text).toContain(URL);
  });

  it('lists each rung and flags tax-free bonds', () => {
    expect(text).toContain('FXD1/A');
    expect(text).toContain('IFB1/B (tax-free)');
  });

  it('degrades gracefully with an empty plan', () => {
    const empty = buildLadder([], [], 1_000_000, 5, 3, asOf);
    expect(formatLadderSummary(empty, URL)).toContain('No ladder to share yet');
  });
});

describe('formatPortfolioSummary', () => {
  it('summarises totals for chat', () => {
    const text = formatPortfolioSummary({ cost: 1_000_000, income: 120_000, weightedNet: 12.3 }, 1, URL);
    expect(text).toContain('1 holding');
    expect(text).toMatch(/Weighted net yield: \*12\.30%\*/);
  });
});

describe('CBK channel', () => {
  it('points at the official WhatsApp channel', () => {
    expect(CBK_WHATSAPP_CHANNEL).toBe('https://whatsapp.com/channel/0029Va5HrcD4dTnNnTguwc24');
  });
});
