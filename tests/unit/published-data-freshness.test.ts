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
    /* meta.json, NOT rates.json.
     *
     * The intent here was always "read a date that cannot be cheaply forged,
     * so the only way to green this is to run the pipeline". rates.json does
     * not satisfy it. `npm run build:rates` regenerates it from data already
     * committed, needs no network, and stamps a fresh generatedAt — so any
     * legitimate edit to tbills.json, which is hand-maintained BY DESIGN,
     * silences the pipeline-liveness alarm as a side effect. That is the "date
     * somebody can edit" this test set out to avoid; it just takes a script
     * rather than a text editor.
     *
     * meta.generatedAt means "the scrapers ran". Nothing local writes it — the
     * scrapers fetch CBK, KNBS, the Treasury and the World Bank — and
     * hand-stamping it is the one edit CLAUDE.md names as forbidden outright.
     * So it is the signal this test's own header describes wanting. */
    const meta = read('meta.json');
    expect(meta.generatedAt, 'meta.json has no generatedAt').toBeTruthy();
    expect(Number.isNaN(new Date(meta.generatedAt).getTime())).toBe(false);
  });

  it('ran the pipeline recently enough that it is alive', () => {
    const age = ageInDays(read('meta.json').generatedAt);
    expect(
      age,
      [
        `the pipeline last ran ${age.toFixed(1)} days ago, past the ${MAX_AGE_DAYS}-day budget.`,
        'Nothing refreshes this on its own any more: run `npm run refresh`',
        'on a machine with real network access — see docs/RUNNING-WITHOUT-ACTIONS.md.',
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
