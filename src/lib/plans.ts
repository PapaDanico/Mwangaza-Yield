// Saved goal plans — the difference between a calculator you re-key every
// visit and a plan you come back to. Stored locally like everything else.

import type { GoalKey } from './goals';
import type { Checkpoint } from './progress';

export interface PlanInputs {
  // FIRE
  targetIncome?: number;
  capital?: number;
  monthly?: number;
  // School fees
  feeCapital?: number;
  firstFeeYear?: number;
  yearsOfFees?: number;
  annualFee?: number;
  // Income / preservation
  incomeCapital?: number;
  parkCapital?: number;
}

export interface SavedPlan {
  id: string;
  name: string;
  goal: GoalKey;
  inputs: PlanInputs;
  createdAt: string;
  updatedAt: string;
  /**
   * What the pot was actually worth, recorded as the saver goes. Optional
   * because every plan saved before progress tracking existed has none, and a
   * plan with no checkpoints is a perfectly good plan — it simply has nothing
   * to report yet. Dexie indexes only declared keys, so this rides along inside
   * the stored record without a schema migration.
   */
  checkpoints?: Checkpoint[];
}

/**
 * Record a reading, replacing any existing one for the same date so that
 * correcting today's figure does not leave two conflicting entries for today.
 */
export function withCheckpoint(plan: SavedPlan, date: string, capitalKES: number, now: string): SavedPlan {
  const kept = (plan.checkpoints ?? []).filter((c) => c.date !== date);
  return {
    ...plan,
    checkpoints: [...kept, { date, capitalKES }].sort((a, b) => a.date.localeCompare(b.date)),
    updatedAt: now,
  };
}

/** Drop a reading entered by mistake. */
export function withoutCheckpoint(plan: SavedPlan, date: string, now: string): SavedPlan {
  return {
    ...plan,
    checkpoints: (plan.checkpoints ?? []).filter((c) => c.date !== date),
    updatedAt: now,
  };
}

/** Suggest a name so saving is one tap, not a naming decision. */
export function suggestPlanName(goal: GoalKey, inputs: PlanInputs): string {
  switch (goal) {
    case 'school-fees':
      return inputs.firstFeeYear ? `School fees from ${inputs.firstFeeYear}` : 'School fees';
    case 'fire':
      return inputs.targetIncome
        ? `Independence — ${Math.round(inputs.targetIncome / 1000)}k a year`
        : 'Financial independence';
    case 'passive-income':
      return 'Passive income';
    case 'capital-preservation':
      return 'Emergency fund';
  }
}

/**
 * Only the fields the chosen goal actually uses, so a saved plan never
 * carries stale numbers from a goal the user was merely browsing.
 */
export function inputsForGoal(goal: GoalKey, all: PlanInputs): PlanInputs {
  switch (goal) {
    case 'fire':
      return { targetIncome: all.targetIncome, capital: all.capital, monthly: all.monthly };
    case 'school-fees':
      return {
        feeCapital: all.feeCapital,
        firstFeeYear: all.firstFeeYear,
        yearsOfFees: all.yearsOfFees,
        annualFee: all.annualFee,
      };
    case 'passive-income':
      return { incomeCapital: all.incomeCapital };
    case 'capital-preservation':
      return { parkCapital: all.parkCapital };
  }
}

export function makePlan(
  goal: GoalKey,
  inputs: PlanInputs,
  name: string,
  now: string,
  id?: string
): SavedPlan {
  const scoped = inputsForGoal(goal, inputs);
  return {
    id: id ?? `plan-${goal}-${now}-${Math.round((scoped.capital ?? scoped.feeCapital ?? scoped.incomeCapital ?? scoped.parkCapital ?? 0))}`,
    name: name.trim() || suggestPlanName(goal, inputs),
    goal,
    inputs: scoped,
    createdAt: now,
    updatedAt: now,
  };
}
