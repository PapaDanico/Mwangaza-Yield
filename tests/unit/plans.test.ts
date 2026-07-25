import { describe, it, expect } from 'vitest';
import { nonNegativeNumber } from '../../src/lib/utils';
import { makePlan, inputsForGoal, suggestPlanName, type PlanInputs } from '../../src/lib/plans';

const NOW = '2026-07-25T00:00:00.000Z';

const ALL: PlanInputs = {
  targetIncome: 1_200_000, capital: 2_000_000, monthly: 50_000,
  feeCapital: 3_000_000, firstFeeYear: 2032, yearsOfFees: 4, annualFee: 400_000,
  incomeCapital: 3_000_000, parkCapital: 500_000,
};

describe('inputsForGoal', () => {
  it('keeps only the fields the goal uses', () => {
    expect(inputsForGoal('fire', ALL)).toEqual({
      targetIncome: 1_200_000, capital: 2_000_000, monthly: 50_000,
    });
    expect(inputsForGoal('capital-preservation', ALL)).toEqual({ parkCapital: 500_000 });
  });

  it('does not leak numbers from goals the user only browsed', () => {
    const fees = inputsForGoal('school-fees', ALL);
    expect(fees).not.toHaveProperty('targetIncome');
    expect(fees).not.toHaveProperty('parkCapital');
    expect(fees.annualFee).toBe(400_000);
  });
});

describe('suggestPlanName', () => {
  it('names a fees plan by its first year', () => {
    expect(suggestPlanName('school-fees', ALL)).toBe('School fees from 2032');
  });
  it('names a FIRE plan by its income target', () => {
    expect(suggestPlanName('fire', ALL)).toBe('Independence — 1200k a year');
  });
  it('falls back cleanly with no inputs', () => {
    expect(suggestPlanName('school-fees', {})).toBe('School fees');
    expect(suggestPlanName('capital-preservation', {})).toBe('Emergency fund');
  });
});

describe('makePlan', () => {
  it('stamps timestamps and scopes the inputs', () => {
    const p = makePlan('fire', ALL, 'Retirement', NOW);
    expect(p.goal).toBe('fire');
    expect(p.name).toBe('Retirement');
    expect(p.createdAt).toBe(NOW);
    expect(p.updatedAt).toBe(NOW);
    expect(p.inputs).not.toHaveProperty('annualFee');
  });

  it('falls back to a suggested name when none is given', () => {
    expect(makePlan('school-fees', ALL, '   ', NOW).name).toBe('School fees from 2032');
  });

  it('reuses the id when updating an existing plan', () => {
    const first = makePlan('fire', ALL, 'Retirement', NOW);
    const updated = makePlan('fire', { ...ALL, capital: 9_000_000 }, 'Retirement', '2026-08-01T00:00:00.000Z', first.id);
    expect(updated.id).toBe(first.id);
    expect(updated.inputs.capital).toBe(9_000_000);
  });

  it('gives distinct ids to distinct plans', () => {
    const a = makePlan('fire', ALL, 'A', NOW);
    const b = makePlan('school-fees', ALL, 'B', NOW);
    expect(a.id).not.toBe(b.id);
  });
});

describe('nonNegativeNumber', () => {
  it('takes a normal figure', () => expect(nonNegativeNumber('500000')).toBe(500_000));
  it('refuses a negative investment', () => expect(nonNegativeNumber('-500000')).toBe(0));
  it('treats an empty box as zero', () => expect(nonNegativeNumber('')).toBe(0));
  it('treats nonsense as zero', () => expect(nonNegativeNumber('abc')).toBe(0));
  it('rejects Infinity', () => expect(nonNegativeNumber('Infinity')).toBe(0));
  it('honours a caller fallback', () => expect(nonNegativeNumber('-1', 2026)).toBe(2026));
  it('keeps fractions', () => expect(nonNegativeNumber('0.5')).toBe(0.5));
});
