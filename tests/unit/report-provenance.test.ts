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

/**
 * The e2e fit check measures the sheet under geometry it writes itself.
 *
 * `tests/e2e/smoke.mjs` asserts nothing overflows and no ink lands within 6mm
 * of the paper edge. Those numbers used to be a COPY of what ReportActions
 * applies at export time, and a copy is a thing that drifts: change the
 * geometry in the exporter and the e2e keeps measuring the old one, passing
 * while real downloads come back from the printer shaved.
 *
 * The exporter no longer captures at one fixed width — it picks the width that
 * prints the largest type for each sheet — so both sides now read
 * CAPTURE_WIDTHS and CAPTURE_PADDING from lib/report-styling.ts instead. This
 * pins that single source, because a shared constant only helps while both
 * sides actually share it.
 *
 * The clearance is not incidental either. The placed image runs to the paper
 * edge by design — what keeps text off a printer's unprintable margin is this
 * padding alone, about 10mm once 1123px is placed across 297mm.
 */
describe('the exporter geometry the e2e fit check assumes', () => {
  const src = read('src/components/report/ReportActions.tsx');

  it('takes its capture geometry from the shared module', () => {
    expect(
      src,
      'the exporter hardcodes its capture geometry again; tests/e2e/smoke.mjs reads report-styling.ts'
    ).toMatch(/chooseCaptureWidth/);
    expect(src).toMatch(/CAPTURE_PADDING/);
    expect(src, 'a hardcoded capture width is back').not.toMatch(/el\.style\.width = '1123px'/);

    const e2e = read('tests/e2e/smoke.mjs');
    expect(
      e2e,
      'the fit check no longer reads the exporter geometry, so it can drift again'
    ).toMatch(/CAPTURE_WIDTHS/);
    expect(e2e).toMatch(/CAPTURE_PADDING/);

    // A4 landscape must still be among the candidates, or the widest sheets
    // have nowhere to lay out.
    const styling = read('src/lib/report-styling.ts');
    expect(styling).toMatch(/CAPTURE_WIDTHS = \[\s*1123/);
  });

  it('still pads enough to clear a printer margin', () => {
    /* Read from lib/report-styling.ts, which both the exporter and the e2e fit
     * check now take it from. Measured against the WIDEST candidate width,
     * because that is where a given pixel of padding buys the fewest
     * millimetres of paper — a narrower layout scales the gutters up with
     * everything else.
     *
     * This is the cheap static floor. The e2e measures the ink's real distance
     * from the paper edge on every sheet at the width actually chosen, which
     * is the check that would catch a height-bound sheet losing clearance. */
    const styling = read('src/lib/report-styling.ts');
    const pad = styling.match(/export const CAPTURE_PADDING = '(\d+)px (\d+)px'/);
    expect(pad, 'the export padding moved or was removed').toBeTruthy();
    const widest = Math.max(
      ...(styling.match(/CAPTURE_WIDTHS = \[([^\]]+)\]/)![1]
        .split(',')
        .map((x) => Number(x.trim())))
    );
    const sideMm = (Number(pad![2]) / widest) * 297;
    expect(sideMm, `side padding is only ${sideMm.toFixed(1)}mm of paper`).toBeGreaterThanOrEqual(6);
  });

  it('still fits the image rather than cropping it', () => {
    // Fit-to-whichever-edge-binds is what makes "no spill" true at all. A
    // revert to fitting width unconditionally crops any sheet taller than the
    // page, and produces a valid one-page PDF while doing it.
    expect(src).toMatch(/contentAspect > pageAspect/);
    expect(src).toMatch(/imgH = pageH \* contentAspect|imgW = pageH \* contentAspect/);
  });
});

/**
 * One page means every list on the sheet is bounded.
 *
 * The header of GoalReport claims it renders "no unbounded lists", and that
 * was true when the income planner picked a fixed three. It is not true of a
 * reader's own selection: naming bonds by hand added a row each, and at
 * twenty-one holdings the sheet measured 1123x1110 — no longer cropped, since
 * the fit contains it, but placed at 212mm on a 297mm page with every figure
 * shrunk to match. A few more and it crosses onto the portrait branch.
 */
describe('the printed sheet stays bounded', () => {
  const src = read('src/components/report/GoalReport.tsx');

  it('caps the holdings table', () => {
    const cap = src.match(/const INCOME_ROWS = (\d+)/);
    expect(cap, 'the income row cap was removed').toBeTruthy();
    expect(src, 'the holdings table iterates the full list again').toMatch(
      /income\.holdings\.slice\(0, INCOME_ROWS\)/
    );
    // Generous enough that the default six, and a doubling of it, print whole.
    expect(Number(cap![1])).toBeGreaterThanOrEqual(12);
    expect(Number(cap![1])).toBeLessThanOrEqual(20);
  });

  it('declares what it left out rather than truncating quietly', () => {
    // A sheet that looks complete and is not is worse than either a long sheet
    // or a short one — it is handed over as a record of what was bought.
    expect(src).toMatch(/income\.holdings\.length > INCOME_ROWS/);
    expect(src).toMatch(/not listed here/);
    expect(src, 'the sheet does not say the totals still count them').toMatch(
      /counts all of them/
    );
  });
});
