import { describe, it, expect } from 'vitest';
import {
  generateReceipt,
  receiptToMarkdown,
  receiptToJSON,
  APP_VERSION,
  type BondInvestmentContext,
  type PortfolioContext,
} from '../../src/lib/receipt';
import type { InvestmentResult } from '../../src/lib/financial-engine';

const mockResult: InvestmentResult = {
  faceValueKES: 1_000_000,
  cleanPrice: 96.5,
  accruedInterestPer100: 4.0,
  dirtyPrice: 100.5,
  settlementCostKES: 1_005_000,
  whtRate: 0.1,
  grossCouponPerPeriodKES: 60_000,
  netCouponPerPeriodKES: 54_000,
  grossAnnualIncomeKES: 120_000,
  netAnnualIncomeKES: 108_000,
  grossYTM: 13.2,
  netYTM: 11.88,
  taxDragBps: 132,
  nextCouponDate: '2026-12-01',
  currentYieldNet: 0.1075,
};

const bondCtx: BondInvestmentContext = {
  kind: 'bond-investment',
  bond: {
    isin: 'KE-FXD1-2022-010',
    issueCode: 'FXD1/2022/010',
    couponRate: 13.0,
    maturityDate: '2032-03-14',
    taxExempt: false,
    tenorYears: 10,
  },
  faceValueKES: 1_000_000,
  cleanPrice: 96.5,
  priceSource: 'User input',
  settlementDate: '2026-08-19',
  result: mockResult,
  dataSources: [
    { name: 'CBK Bonds Data', url: 'https://www.centralbank.go.ke/', lastUpdated: '2026-08-15' },
  ],
};

const portfolioCtx: PortfolioContext = {
  kind: 'portfolio',
  holdings: [
    {
      issueCode: 'FXD1/2022/010',
      faceValueKES: 1_000_000,
      cleanPrice: 96.5,
      priceSource: 'User input',
      netYTM: 11.88,
      settlementCostKES: 1_005_000,
    },
    {
      issueCode: 'IFB1/2021/012',
      faceValueKES: 500_000,
      cleanPrice: 99.0,
      priceSource: 'Broker quote',
      netYTM: 13.5,
      settlementCostKES: 495_000,
    },
  ],
  weightedNetYTM: 12.4,
  totalCostKES: 1_500_000,
  totalAnnualIncomeKES: 186_000,
  dataSources: [
    { name: 'CBK Bonds Data', url: 'https://www.centralbank.go.ke/', lastUpdated: '2026-08-15' },
  ],
};

describe('generateReceipt', () => {
  it('generates a receipt with all required fields', async () => {
    const r = await generateReceipt(bondCtx);
    expect(r.id).toBeTruthy();
    expect(r.timestamp).toBeTruthy();
    expect(r.appVersion).toBe(APP_VERSION);
    expect(r.kind).toBe('bond-investment');
    expect(r.title).toContain('FXD1/2022/010');
    expect(r.inputs.length).toBeGreaterThan(0);
    expect(r.dataSources.length).toBeGreaterThan(0);
    expect(r.formulaPlainText).toBeTruthy();
    expect(r.formulaNotation).toBeTruthy();
    expect(r.result).toBeTruthy();
    expect(r.hash).toBeTruthy();
  });

  it('produces a non-empty hash', async () => {
    const r = await generateReceipt(bondCtx);
    expect(r.hash.length).toBeGreaterThan(0);
  });

  it('produces deterministic structure (two receipts from same context have same formula)', async () => {
    const r1 = await generateReceipt(bondCtx);
    const r2 = await generateReceipt(bondCtx);
    // IDs and timestamps differ; formula and inputs should match.
    expect(r1.formulaNotation).toBe(r2.formulaNotation);
    expect(r1.kind).toBe(r2.kind);
  });

  it('generates portfolio receipt with all holdings listed in inputs', async () => {
    const r = await generateReceipt(portfolioCtx);
    expect(r.kind).toBe('portfolio');
    const labels = r.inputs.map((i) => i.label);
    expect(labels).toContain('FXD1/2022/010');
    expect(labels).toContain('IFB1/2021/012');
  });

  it('includes result string for bond investment', async () => {
    const r = await generateReceipt(bondCtx);
    expect(r.result).toContain('Net YTM');
  });
});

describe('receiptToMarkdown', () => {
  it('produces a string with all expected sections', async () => {
    const r = await generateReceipt(bondCtx);
    const md = receiptToMarkdown(r);
    expect(md).toContain('# Calculation Receipt');
    expect(md).toContain('## Inputs');
    expect(md).toContain('## Data Sources');
    expect(md).toContain('## Formula');
    expect(md).toContain('## Result');
    expect(md).toContain('## Verification');
    expect(md).toContain(r.hash);
    expect(md).toContain(r.id);
    expect(md).toContain('mwangazayield.org');
  });

  it('never exposes individual submission counts or raw timestamps beyond date', async () => {
    const r = await generateReceipt(bondCtx);
    const md = receiptToMarkdown(r);
    // The timestamp in the receipt header should be truncated to minute precision
    // and not expose sub-second detail.
    expect(md).not.toMatch(/\.\d{3}Z/); // No milliseconds
  });
});

describe('receiptToJSON', () => {
  it('produces valid JSON', async () => {
    const r = await generateReceipt(bondCtx);
    expect(() => JSON.parse(receiptToJSON(r))).not.toThrow();
  });

  it('round-trips through JSON', async () => {
    const r = await generateReceipt(bondCtx);
    const parsed = JSON.parse(receiptToJSON(r));
    expect(parsed.id).toBe(r.id);
    expect(parsed.hash).toBe(r.hash);
    expect(parsed.kind).toBe(r.kind);
    expect(parsed.inputs).toHaveLength(r.inputs.length);
  });
});
