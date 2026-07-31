import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

/**
 * Mwangaza holds no personal data on any server it controls.
 *
 * Distinct from no-personal-data.test.ts, which guards the REPOSITORY against
 * committed identifiers after a DhowCSD export trailer carried a real KRA PIN
 * into a public repo. This one guards the RUNNING SERVICE. Same principle,
 * different surface, and both are needed: the repository leak was an accident,
 * and this one would be a design decision.
 *
 * WHY IT IS A TEST AND NOT A NOTE
 *
 * The Data Protection (Registration of Data Controllers and Data Processors)
 * Regulations, 2021 exempt a controller under Ksh 5 million turnover AND under
 * ten employees — but disapply that exemption for any purpose in the THIRD
 * SCHEDULE, which includes "provision of financial services". For a purpose on
 * that list registration is mandatory regardless of size, so being small stops
 * helping. Whether a bond calculator is "provision of financial services" is
 * arguable; holding no personal data is not.
 *
 * WHAT WAS REMOVED, AND WHY IT COUNTED
 *
 * Until July 2026, turning on alerts stored a push endpoint, its two encryption
 * keys and the market-wide rules chosen, in Netlify Blobs. That store was built
 * with real care: a whitelist kept holdings out, the key was a SHA-256 of the
 * endpoint, and no name or e-mail was ever collected.
 *
 * It counted anyway. A push endpoint is a URL that delivers to one specific
 * person's device — an online identifier, and personal data whatever else is
 * absent. The care taken over what it did NOT contain never changed what it
 * WAS.
 *
 * THE COST, RECORDED HONESTLY
 *
 * Alerts no longer arrive while the app is closed. That is a real loss and the
 * privacy notice says so rather than selling the change as pure gain. It is
 * affordable because auction bid windows carry five days' notice and T-bill
 * results are weekly: an alert seen on next open is still an alert in time. It
 * would NOT be affordable for an intraday product, so if this ever becomes one
 * the trade needs re-making rather than inheriting.
 *
 * If you are here because this failed and you DO intend to collect personal
 * data again, that is a decision for the operator and its advisers — not a
 * test to delete. Registration, a DPO assessment and the privacy notice all
 * have to move on the same commit.
 */
const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p: string) => readFileSync(`${ROOT}${p}`, 'utf8');
const exists = (p: string) => existsSync(`${ROOT}${p}`);

describe('no personal data reaches any server we control', () => {
  const functions = readdirSync(`${ROOT}netlify/functions`).filter((f) => /\.mts$/.test(f));

  it('found functions to check, so the guard is not vacuous', () => {
    expect(functions.length, 'no functions found — the checks below prove nothing').toBeGreaterThan(
      0
    );
  });

  it('ships no endpoint that accepts a subscription', () => {
    for (const gone of [
      'netlify/functions/subscribe.mts',
      'netlify/functions/send-alerts.mts',
      'src/lib/push.ts',
      'src/lib/push-send.ts',
      'src/lib/push-rules.ts',
    ]) {
      expect(exists(gone), `${gone} is back — read the header before restoring it`).toBe(false);
    }
  });

  it('keeps the function directory to genuinely anonymous work', () => {
    /* What remains is a tool counter. If anything here starts accepting an
     * endpoint, a token or a subscription, the position above stops being true
     * whatever the privacy notice happens to say. */
    const offenders: string[] = [];
    for (const f of functions) {
      const src = read(`netlify/functions/${f}`)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      for (const pattern of [/pushManager/, /webpush/i, /p256dh/, /vapid/i]) {
        if (pattern.test(src)) offenders.push(`${f} (${pattern.source})`);
      }
    }
    expect(
      offenders,
      'a function looks like it handles push subscriptions again; comments are stripped first, so this is shipped code'
    ).toEqual([]);
  });

  it('registers no scheduled sender', () => {
    /* send-alerts ran on a cron. A schedule is the tell that something delivers
     * TO people rather than serving requests FROM them. */
    for (const f of functions) {
      expect(read(`netlify/functions/${f}`), `${f} declares a cron schedule`).not.toMatch(
        /schedule:\s*['"]/
      );
    }
  });

  it('has a service worker that cannot receive a push', () => {
    const sw = read('public/sw.js');
    expect(sw, "the service worker handles 'push' again").not.toMatch(
      /addEventListener\(\s*['"]push['"]/
    );
    /* notificationclick MUST stay. The app raises its own banners through the
     * registration because Android refuses `new Notification()` from a page, so
     * deleting it would break local alerts while proving nothing about privacy. */
    expect(sw, 'local notifications were broken along the way').toMatch(/notificationclick/);
  });

  it('catches a push handler when one is introduced', () => {
    /* Mutation check in both directions — the probe has to match the thing it
     * forbids and not the thing it requires. */
    const probe = /addEventListener\(\s*['"]push['"]/;
    expect(probe.test("self.addEventListener('push', (e) => {})")).toBe(true);
    expect(probe.test("self.addEventListener('notificationclick', (e) => {})")).toBe(false);
  });
});
