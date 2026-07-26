/**
 * Daily ledger update, run by the refresh-data CI job after the scrapers.
 *
 * Records the bid assistant's range for every upcoming auction not yet in
 * public/data/predictions.json, and scores any prediction whose result has
 * since published. The append-only guarantee is checked here on every run —
 * if an update would rewrite recorded history, the script exits non-zero and
 * nothing is written, because a track record that can be edited is not one.
 *
 * Uses the BUILT engine (dist/engine), the same artifact a licensee gets.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const P = await import('../dist/engine/lib/predictions.js');

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const LEDGER = 'public/data/predictions.json';

const before = existsSync(LEDGER) ? read(LEDGER) : [];
const auctions = read('public/data/auctions.json');
const prints = read('public/data/auction-results.json');
const bonds = read('public/data/bonds.json');
const today = new Date().toISOString().slice(0, 10);

let after = P.recordPredictions(before, auctions, prints, bonds, today);
after = P.scorePredictions(after, prints, today);

const problems = P.assertLedgerIntegrity(before, after);
assert.deepEqual(problems, [], `ledger integrity violated:\n${problems.join('\n')}`);

writeFileSync(LEDGER, JSON.stringify(after, null, 2) + '\n');

const s = P.summariseLedger(after);
console.log(
  `predictions: ${s.recorded} recorded (${after.length - before.length} new), ` +
  `${s.scored} scored, range hit ${s.hitRange}/${s.claims}, middle half ${s.hitMiddleHalf}/${s.claims}`
);
