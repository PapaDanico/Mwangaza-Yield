/**
 * Prove the BUILT engine works from plain Node — the artifact a licensee would
 * receive, not the sources the app imports. Every expected figure is from the
 * real ABC Capital broker sheet of 20-Jul-2026 (see tests/unit/sell.test.ts),
 * so this doubles as the demo run for a licensing pitch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const E = await import('../dist/engine/lib/engine.js');

const IFB = {
  isin: 'KE8000002322', issueCode: 'IFB1/2022/18', name: '18-Year Infrastructure Bond',
  category: 'IFB', issueDate: '2022-06-13', maturityDate: '2040-05-21', tenorYears: 18,
  couponRate: 13.742, couponFrequencyPerYear: 2, ytmGross: 13.742,
  minInvestmentKES: 50_000, taxExempt: true,
};

// 1. The sell evaluator reproduces the broker sheet through the built artifact.
const a = E.analyseSale(IFB, {
  faceValueKES: 400_000, settlementDate: '2026-07-20', dirtyPrice: 107.8145,
  quotedYTM: 12.5, commissionKES: 1_500, leviesKES: 47.44,
  amortisation: [{ date: '2031-06-02', fraction: 0.5 }],
});
assert.ok(Math.abs(a.accruedInterestKES - 6_342.46) < 0.01, `accrued ${a.accruedInterestKES}`);
assert.ok(Math.abs(a.netProceedsKES - 429_710.56) < 0.01, `net ${a.netProceedsKES}`);
assert.ok(Math.abs(a.ourDirtyAtQuotedYTM - 107.8145) < 0.01, `dirty ${a.ourDirtyAtQuotedYTM}`);

// 2. Bid guidance runs against the real shipped archive.
//
// TWO QUESTIONS, KEPT APART — THEY WERE CONFLATED AND IT COST A FALSE ALARM
//
// "Does the built engine work" and "does the archive currently hold enough
// 10-year taxable paper" are different, and only the first is what a smoke
// test of the artifact can promise. This asserted `g.count >= 10` — a literal
// twice the engine's own sufficiency bar, MIN_SAMPLE, which is 5. So the
// engine returned a perfectly good result (count 6, thin false, 365-day
// window, median 13.24) and the test failed it.
//
// Worse, it failed it with the message `guidance thin (6)` while `thin` was
// FALSE. The count clause was the one that broke and the message named the
// other one, sending a reader after a thinness bug that does not exist. A
// wrong explanation is more expensive than no explanation, so each condition
// now reports itself.
const prints = JSON.parse(readFileSync('public/data/auction-results.json', 'utf8'));
const bonds = JSON.parse(readFileSync('public/data/bonds.json', 'utf8'));

// The archive itself, asserted separately and generously: this is a data
// question, and it fails loudly if the shipped history is ever gutted.
assert.ok(prints.length >= 100, `auction archive holds only ${prints.length} prints`);

const g = E.bidGuidance(prints, bonds, 10, { taxExempt: false });
assert.equal(g.thin, false, `engine reports the sample thin at count ${g.count}`);
assert.ok(
  g.count >= E.MIN_SAMPLE,
  `count ${g.count} is below the engine's own MIN_SAMPLE of ${E.MIN_SAMPLE}`
);
assert.ok(g.median > 8 && g.median < 20, `median ${g.median} outside plausible band`);
assert.equal(E.readBid(g.median, g).verdict, 'competitive');
console.log(`  bid guidance: count ${g.count}, window ${g.windowDays}d, median ${g.median.toFixed(3)}`);

// 3. Demand is grouped, never per record.
const demand = E.demandByAuction(prints);
assert.ok(demand.length >= 10 && demand[0].coverRatio > 0, 'demand empty');

// 4. Core pricing.
const r = E.computeBondInvestment(IFB, 100_000, 100, new Date('2026-07-20'));
assert.ok(r.netYTM > 0, 'pricing failed');

console.log('engine smoke: PASSED');
console.log(`  sell: accrued ${a.accruedInterestKES.toFixed(2)}, net ${a.netProceedsKES.toFixed(2)}`);
console.log(`  bid (10y taxable): n=${g.count}, median ${g.median.toFixed(2)}%`);
console.log(`  demand: last cover ${demand[0].coverRatio.toFixed(2)}x over ${demand.length} auctions`);
