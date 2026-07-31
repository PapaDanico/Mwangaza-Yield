import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The published figures must not go stale without CI saying so.
 *
 * THE ALARM WAS WIRED TO THE THING IT WATCHES
 *
 * healthcheck.py decides whether the shipped data has aged out, and it runs in
 * exactly two places: the `refresh-data` job, which fires on schedule, and
 * `validate-sources`, which is workflow_dispatch only. `test-and-build` runs
 * test_healthcheck.py — the unit test OF the healthcheck, not the check itself.
 *
 * So the freshness alarm only sounds when the refresh runs. Every way the
 * schedule can stop — a cron edit, a workflow syntax error, GitHub disabling
 * schedules on an idle repository, an exhausted quota — takes the detector
 * with it. The failure is silent by construction: the site keeps serving
 * whatever it last built, every push stays green, and nothing anywhere is red.
 *
 * JiPange already reasoned this out, in sync-rates.yml:
 *
 *     "The real backstop is the test that fails when the shipped snapshot goes
 *      stale, because a job can stop firing altogether and no schedule fixes
 *      that."
 *
 * and implements it as SNAPSHOT_MAX_AGE_DAYS in rates-feed.test.ts. Mwangaza
 * is the product those figures come FROM, where staleness costs the most, and
 * had no equivalent. This is that backstop.
 *
 * It runs on every push and pull request, so it cannot be switched off by the
 * same failure it is watching for.
 */
const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f: string) => JSON.parse(readFileSync(`${ROOT}public/data/${f}`, 'utf8'));

/**
 * Wide enough to absorb a weekend plus a public holiday — the refresh runs
 * weekdays only — and tight enough to notice a stopped pipeline long before a
 * reader would. Deliberately looser than the UI's own staleness notice: this
 * is about the machinery having died, not about a figure being a day old.
 */
const MAX_AGE_DAYS = 8;

const ageInDays = (iso: string): number =>
  (Date.now() - new Date(iso).getTime()) / 86_400_000;

describe('the published data is still being refreshed', () => {
  it('has a machine-written generatedAt to measure', () => {
    /* Read from the generated feed rather than a hand-kept constant, so the
     * cheapest way to silence this test is to actually run the pipeline. A
     * date somebody can edit is a date somebody will edit. */
    const rates = read('rates.json');
    expect(rates.generatedAt, 'rates.json has no generatedAt').toBeTruthy();
    expect(Number.isNaN(new Date(rates.generatedAt).getTime())).toBe(false);
  });

  it('regenerated the rates feed recently enough that the pipeline is alive', () => {
    const age = ageInDays(read('rates.json').generatedAt);
    expect(
      age,
      [
        `rates.json was generated ${age.toFixed(1)} days ago, past the ${MAX_AGE_DAYS}-day budget.`,
        'The daily refresh has probably stopped firing — check the schedule on',
        '.github/workflows/ci.yml and the last successful refresh-data run.',
        'Readers are being served whatever the site last built.',
      ].join(' ')
    ).toBeLessThan(MAX_AGE_DAYS);
  });

  it('still has T-bill and auction records to serve', () => {
    /* A freshness check on a timestamp passes happily over an empty file. The
     * ladder empty-state bug earlier this week was exactly this: a load that
     * returned nothing looked identical to a market with nothing in it. */
    const tbills = read('tbills.json');
    const auctions = read('auctions.json');
    const bonds = read('bonds.json');
    expect(tbills.length, 'tbills.json is empty').toBeGreaterThan(0);
    expect(auctions.length, 'auctions.json is empty').toBeGreaterThan(0);
    expect(bonds.length, 'bonds.json is empty').toBeGreaterThan(40);
  });

  it('has not published an auction calendar that is entirely in the past', () => {
    /* The calendar is the page readers act on — a bid window is the one thing
     * here that expires. If every entry has closed, the calendar is not stale
     * in the sense of "a bit old", it is useless, and the freshness of
     * rates.json would not reveal it. */
    const auctions = read('auctions.json') as { offerCloseDate?: string }[];
    const dates = auctions.map((a) => a.offerCloseDate).filter(Boolean) as string[];
    expect(dates.length, 'no auction carries an offerCloseDate').toBeGreaterThan(0);
    const latest = dates.sort().at(-1)!;
    expect(
      new Date(latest).getTime(),
      `the newest auction closed on ${latest} — the calendar has nothing live in it`
    ).toBeGreaterThan(Date.now() - 3 * 86_400_000);
  });
});
