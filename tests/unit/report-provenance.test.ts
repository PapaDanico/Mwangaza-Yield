import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CASHFLOW_SOURCES, NOT_ADVICE, dataAsOf, DATA_GENERATED_AT } from '../../src/lib/provenance';

const REPORTS = [
  'src/components/report/LadderReport.tsx',
  'src/components/report/GoalReport.tsx',
];

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/**
 * The printed report is the artifact that leaves the building.
 *
 * A figure on a screen carries its context — the page around it, the tooltips,
 * the sources link. A PDF handed to a board or an auditor carries only its own
 * footer, and it is the PDF that gets relied on six months later. So the footer
 * has to be true on its own.
 *
 * Both footers used to read "Sources: Central Bank of Kenya, National Treasury,
 * KNBS". Neither report touches Treasury or KNBS data — they compute from bond
 * cash flows and a price and consult nothing else. Two of three credits were
 * decorative, and the third was imprecise in a way this project already
 * documents on /sources: the CPI originates with KNBS but is READ FROM CBK,
 * because KNBS is not reliably reachable. Naming it implies a fetch that never
 * happened.
 */
describe('a printed report states its own provenance truthfully', () => {
  it('credits no source the report does not actually read', () => {
    // If a report ever genuinely consumes Treasury or KNBS data, this should be
    // relaxed deliberately — and the import that made it true will be visible
    // in the same diff.
    for (const p of REPORTS) {
      const src = read(p);
      expect(src, `${p} credits KNBS; no report reads KNBS data`).not.toMatch(/KNBS/);
      expect(src, `${p} credits the National Treasury; no report reads Treasury data`).not.toMatch(
        /National Treasury/
      );
    }
  });

  it('says where the numbers did come from', () => {
    for (const p of REPORTS) {
      expect(read(p), `${p} has no source line`).toMatch(/CASHFLOW_SOURCES/);
    }
    expect(CASHFLOW_SOURCES).toMatch(/Central Bank of Kenya/);
    expect(CASHFLOW_SOURCES).toMatch(/auction results/i);
    // And is explicit that no market price is published, which is the NSE
    // constraint this project works under rather than an incidental detail.
    expect(CASHFLOW_SOURCES).toMatch(/no market\s+price is published/i);
  });

  it('dates the underlying data, because paper cannot be refreshed', () => {
    for (const p of REPORTS) {
      expect(read(p), `${p} does not date its data`).toMatch(/dataAsOf\(\)/);
    }
    expect(dataAsOf()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(DATA_GENERATED_AT).getTime())).toBe(false);
  });

  it('states what the document is, not only what it is not', () => {
    for (const p of REPORTS) {
      expect(read(p), `${p} carries no not-advice line`).toMatch(/NOT_ADVICE/);
    }
    // "Not advice" alone leaves the reader to guess what it is instead. The
    // positive claim is the one that holds up if anybody ever asks.
    expect(NOT_ADVICE).toMatch(/calculation from the inputs/i);
    expect(NOT_ADVICE).toMatch(/not investment advice/i);
    expect(NOT_ADVICE).toMatch(/not an offer to buy or sell/i);
  });

  /**
   * The wording that would change what this is.
   *
   * A calculation becomes advice when it tells the reader what to do. That
   * distinction is not cosmetic — providing investment advice for a fee is a
   * licensed activity in Kenya, and a printed deliverable is exactly where an
   * imperative would be read as one. This fails on the words rather than
   * waiting for someone to notice.
   */
  it('never tells the reader what to do in a printed report', () => {
    const IMPERATIVES = [
      /\byou should (?:buy|sell|bid|switch|invest)/i,
      /\bwe recommend\b/i,
      /\brecommended (?:bid|action|allocation)\b/i,
      /\b(?:execute|hold) (?:this|the) (?:trade|switch)\b/i,
      /\bbest (?:buy|investment)\b/i,
    ];
    for (const p of REPORTS) {
      const src = read(p);
      for (const re of IMPERATIVES) {
        expect(src, `${p} contains advice-shaped wording: ${re}`).not.toMatch(re);
      }
    }
  });
});

/**
 * The printed sheet has to say the same thing the screen said.
 *
 * These two defects are the same defect twice: a figure fixed on the page and
 * left standing in the report. The report is the copy that outlives the
 * session — nobody re-opens the browser to check a number they already have on
 * paper — so a stale figure here is worse than a stale figure on screen, not
 * better.
 */
describe('the passive-income sheet', () => {
  const src = read('src/components/report/GoalReport.tsx');

  it('never prints a flat monthly average', () => {
    // The annual figure over twelve, when half those months can pay nothing.
    // Fixed on the page — the label reads "In the months it pays" — and left
    // in the report for a while afterwards, where it understates every month
    // that pays and overstates every month that does not.
    expect(src, 'the report divides the year by twelve again').not.toMatch(/averageMonthlyKES/);
    expect(src).toMatch(/In the months it pays/);
  });

  it('writes months in three letters, not one', () => {
    // "Pays in: J · D" is January, June or July, and a printed sheet has
    // nothing to hover. Asserted on the array itself so a revert is visible.
    const months = src.match(/const MONTHS = \[([^\]]*)\]/);
    expect(months, 'the month labels moved or were renamed').toBeTruthy();
    const labels = months![1].match(/'([A-Za-z]+)'/g)!.map((s) => s.replace(/'/g, ''));
    expect(labels).toHaveLength(12);
    expect(new Set(labels).size, 'two months share a label').toBe(12);
    for (const l of labels) expect(l.length, `${l} is ambiguous`).toBeGreaterThan(1);
  });

  it('shows the alternatives that were not chosen', () => {
    // The rationale. Without it the sheet states a decision and cannot answer
    // the first question anybody asks of it: why not take more income?
    expect(src).toMatch(/Why this spread/);
    expect(src).toMatch(/incomeOptions/);
    expect(src, 'the forgone income is not on the sheet').toMatch(/givesUpKES/);
  });
});
