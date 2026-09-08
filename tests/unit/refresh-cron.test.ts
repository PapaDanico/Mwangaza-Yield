/**
 * The cron wrapper and the refresh share one contract, and it is a number.
 *
 * `refresh-data.mjs` exits 3 when nothing arrived — the ordinary outcome on a
 * day CBK published nothing, on a laptop that was asleep, or behind an egress
 * proxy. `refresh-cron.sh` reads that 3 and stays quiet; every other non-zero
 * exit it reports as a fault.
 *
 * Nothing else enforces the pairing. Change the exit code on one side and the
 * scheduled job either alarms every morning until the operator stops reading
 * the log, or swallows a genuine failure — and both fail silently, on a
 * machine nobody is watching, which is precisely where this code runs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const refresh = readFileSync(`${root}scripts/refresh-data.mjs`, 'utf8');
const cron = readFileSync(`${root}scripts/refresh-cron.sh`, 'utf8');

describe('the refresh/cron exit-code contract', () => {
  it('refresh-data exits 3 on the nothing-arrived path', () => {
    // Anchored to the message so a 3 appearing elsewhere cannot satisfy it.
    const discarded = refresh.slice(refresh.indexOf('NOTHING WAS FETCHED'));
    expect(discarded).toMatch(/process\.exit\(3\)/);
  });

  it('the wrapper treats exactly that code as normal', () => {
    // `3)` as a case label, then the reset to 0 that keeps cron quiet.
    expect(cron).toMatch(/^\s*3\)/m);
    expect(cron.slice(cron.indexOf('case $status'))).toMatch(/status=0/);
  });

  it('the wrapper does not swallow other failures', () => {
    // The catch-all arm must not zero the status; a fault has to surface.
    const other = cron.slice(cron.indexOf('*) say "refresh exited'));
    expect(other).not.toMatch(/status=0/);
    expect(other).toMatch(/exit \$status/);
  });
});

describe('the wrapper survives cron itself', () => {
  it('is executable, or cron cannot run it at all', () => {
    // eslint-disable-next-line no-bitwise
    expect(statSync(`${root}scripts/refresh-cron.sh`).mode & 0o111).toBeGreaterThan(0);
  });

  it('does not assume npm is on the default cron PATH', () => {
    // /usr/bin:/bin is all cron gives; every node version manager lives
    // outside it. Hard-coding /usr/bin/npm is the failure this replaced.
    expect(cron).not.toMatch(/\/usr\/bin\/npm/);
    expect(cron).toMatch(/NODE_BIN/);
  });

  it('is what the documented crontab line actually calls', () => {
    const doc = readFileSync(`${root}docs/RUNNING-WITHOUT-ACTIONS.md`, 'utf8');
    const line = doc.split('\n').find((l) => /^\d+ [\d,]+ \* \* /.test(l.trim()));
    expect(line).toBeDefined();
    expect(line).toContain('scripts/refresh-cron.sh');
  });
});
