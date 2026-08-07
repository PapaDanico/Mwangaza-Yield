import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The channel invitation may only appear after the reader has been given
 * something — and it may never become a form.
 *
 * WHY THIS EXISTS
 *
 * Two external reviews recommended an email capture form, both at P2, both
 * reasoning that people who calculate a yield want to know when rates change.
 * The goal is right. The mechanism was declined on 2026-08-07 for a reason
 * already written into the privacy notice:
 *
 *   Until July 2026 turning on alerts issued a push endpoint ... that makes it
 *   personal data whatever else it does not contain. It is gone. ... no
 *   question about whether we are a data controller — because we hold no
 *   personal data at all.
 *
 * An email address is more identifying than a push endpoint. Collecting one
 * would reverse a deliberate decision, falsify a published Data Protection Act
 * s.29 notice, and put the company back in scope as a data controller.
 *
 * So the re-engagement route is the WhatsApp channel, which costs the reader
 * nothing: WhatsApp does not show channel admins who follows, so there is no
 * number to receive and no list to keep.
 *
 * TWO THINGS THIS GUARDS
 *
 * 1. PLACEMENT. The invitation goes after a computed result, never on a
 *    landing or marketing page. Asking for a reader's attention before helping
 *    them is the same move as asking for their money before helping them, with
 *    a smaller price tag.
 *
 * 2. THAT IT DOES NOT QUIETLY BECOME A FORM. The next person to read a growth
 *    checklist will suggest the email box again, in good faith, because it is
 *    the obvious thing. This fails the build if an email input appears, so the
 *    decision has to be made deliberately — by editing this file and the
 *    privacy notice together — rather than by adding an input.
 */

const ROOT = new URL('../../', import.meta.url).pathname;
const APP = join(ROOT, 'src', 'app');

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

/** Every file under src/app that renders the invitation. */
function usingFollowChannel(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name) && /<FollowChannel\b/.test(read(p))) out.push(p);
    }
  };
  walk(APP);
  return out;
}

/** Pages that exist to introduce the product, where nothing has been given yet. */
const NO_RESULT_YET = ['about', 'learn', 'faq', 'glossary', 'support', 'terms',
  'privacy', 'disclaimer', 'sources', 'licensing'];

describe('the WhatsApp channel invitation', () => {
  it('is actually placed somewhere, so the checks below are not vacuous', () => {
    // Without this, deleting the component passes every assertion here.
    expect(usingFollowChannel().length).toBeGreaterThan(0);
  });

  it('never appears on a page that has given the reader nothing yet', () => {
    const wrong = usingFollowChannel().filter((p) =>
      NO_RESULT_YET.some((seg) => p.includes(`${APP}/${seg}/`)));
    expect(
      wrong,
      `the invitation appears before any result on: ${wrong.join(', ')}`,
    ).toEqual([]);
  });

  it('never appears on the home page', () => {
    // Split out from the list above because the home page is the single most
    // likely place for it to be added "for reach", and the most wrong.
    expect(/<FollowChannel\b/.test(read(join(APP, 'page.tsx')))).toBe(false);
  });

  it('sits after the guard that proves a result exists', () => {
    // A component placed in a client file is only "after a result" if the file
    // returns early when there is none. Both current hosts do; this makes that
    // a requirement rather than a coincidence.
    for (const p of usingFollowChannel()) {
      const src = read(p);
      const guard = /if\s*\(![^)]*\)\s*return\s*(<DataState|null)/.test(src);
      expect(
        guard,
        `${p} renders the invitation but has no early return for the no-result `
          + `case, so it can show before the reader has been given anything`,
      ).toBe(true);
    }
  });

  it('collects nothing — no email input anywhere in the app', () => {
    /* THE DECISION THIS PROTECTS. An email field is the obvious growth move
     * and was recommended twice. It is declined, and the reason is regulatory
     * rather than aesthetic: the privacy notice states we hold no personal
     * data at all. If that changes, this test and the notice change together. */
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx$/.test(e.name)) continue;
        const src = read(p);
        // A mailto: link is fine — that opens the reader's own mail client and
        // sends us nothing until they choose to write. An INPUT is not.
        if (/<input[^>]+type=["']email["']/i.test(src)
          || /\bdata-netlify\b/i.test(src)) offenders.push(p);
      }
    };
    walk(join(ROOT, 'src'));
    expect(
      offenders,
      `email capture found in: ${offenders.join(', ')}. The privacy notice says `
        + `we hold no personal data at all — change both together or neither.`,
    ).toEqual([]);
  });

  it('does not promise personal reminders it cannot deliver', () => {
    // Duplicated in spirit by pesa-smart-channel.test.ts, asserted here too
    // because this component is the newest place the claim could creep in.
    const src = read(join(ROOT, 'src/components/shared/FollowChannel.tsx'));
    expect(src.length).toBeGreaterThan(200);
    expect(/\byour\s+(coupons?|maturit\w+|holdings?|portfolio)\b/i.test(src)).toBe(false);
  });
});
