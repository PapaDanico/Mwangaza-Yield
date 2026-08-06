import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { INDICATOR_BUDGETS, DEFAULT_BUDGET_DAYS } from '../../src/lib/indicator-freshness';

/**
 * `INDICATOR_BUDGETS` is a copy of PER_INDICATOR_BUDGETS in healthcheck.py,
 * because TypeScript cannot import Python. A copy is a thing that goes out of
 * date — and this pair matters more than most, because the two halves face
 * opposite ways: the Python decides whether the PIPELINE alarms, the
 * TypeScript decides whether the READER is told. Drift means the operator and
 * the reader disagree about whether a figure is current, and only one of them
 * finds out.
 *
 * This is the same guard `schedule-matches-workflow.test.ts` applies to the
 * cron expression, for the same reason.
 */

const PY = readFileSync('backend/scrapers/healthcheck.py', 'utf8');

/** Pull `"NAME": (days, "why"),` pairs out of the PER_INDICATOR_BUDGETS dict. */
function pythonBudgets(): Record<string, number> {
  const start = PY.indexOf('PER_INDICATOR_BUDGETS = {');
  expect(start, 'PER_INDICATOR_BUDGETS not found in healthcheck.py').toBeGreaterThan(-1);
  const end = PY.indexOf('\n}', start);
  const block = PY.slice(start, end);
  const out: Record<string, number> = {};
  for (const m of block.matchAll(/^\s*"(\w+)":\s*\((\d+),/gm)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

/** The Python fallback used for an indicator with no entry. */
function pythonDefault(): number {
  const m = PY.match(/budget,\s*why\s*=\s*(\d+),\s*"no specific budget/);
  expect(m, 'python fallback budget not found').toBeTruthy();
  return Number(m![1]);
}

describe('the parser these checks rest on', () => {
  // A comparison of two empty objects is not a comparison.
  it('finds the Python budgets at all', () => {
    expect(Object.keys(pythonBudgets()).length).toBeGreaterThanOrEqual(4);
  });

  it('finds the Python fallback', () => {
    expect(pythonDefault()).toBeGreaterThan(0);
  });
});

describe('the reader and the pipeline agree on what is current', () => {
  it('covers exactly the same indicators', () => {
    expect(Object.keys(INDICATOR_BUDGETS).sort()).toEqual(Object.keys(pythonBudgets()).sort());
  });

  it('uses the same number of days for each', () => {
    const py = pythonBudgets();
    for (const [name, budget] of Object.entries(INDICATOR_BUDGETS)) {
      expect(budget.days, `${name} budget differs from healthcheck.py`).toBe(py[name]);
    }
  });

  it('falls back to the same default', () => {
    expect(DEFAULT_BUDGET_DAYS).toBe(pythonDefault());
  });

  it('gives the daily rate the tightest budget of all', () => {
    // Not arbitrary: FX is the one that rotted, and the whole point of
    // per-indicator budgets is that it cannot inherit a monthly threshold.
    const days = Object.values(INDICATOR_BUDGETS).map((b) => b.days);
    expect(INDICATOR_BUDGETS.FX_USD_KES.days).toBe(Math.min(...days));
  });

  it('states a cadence for every indicator, since the reader is shown it', () => {
    for (const [name, b] of Object.entries(INDICATOR_BUDGETS)) {
      expect(b.cadence, `${name} has no cadence text`).toBeTruthy();
      expect(b.cadence.length, `${name} cadence too terse to read as a reason`).toBeGreaterThan(10);
    }
  });
});
