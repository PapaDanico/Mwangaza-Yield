import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CBK_WHATSAPP_CHANNEL, PESA_SMART_CHANNEL, PESA_SMART_NAME } from '../../src/lib/share';

/**
 * Two things about our WhatsApp channel that must not erode.
 *
 * IT IS NOT CBK'S. Both links appear on the auctions page and in the footer.
 * A reader who confuses them is worse off than one who found neither, because
 * they would read our commentary as a central-bank announcement. The distinct
 * name is the whole defence, so it is asserted wherever the URL appears.
 *
 * IT CARRIES MARKET NEWS ONLY. This is the one that would do real harm. The
 * alerts page promises, in those words, that coupons and maturities never
 * leave the device — and they cannot, because the app never receives holdings.
 * "Get your coupon reminders on WhatsApp" is the obvious next feature somebody
 * writes, and it is impossible without collecting exactly what we refuse to
 * collect. It would also be a lie on a page whose entire purpose is to state
 * the limits of what we can reach.
 *
 * So the guard is on the copy, not on the constant. Adding the link again is
 * free; describing it as personal is what fails.
 */
const ROOT = new URL('../../', import.meta.url).pathname;

const shipped = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

const sourceFiles = (): string[] =>
  execFileSync('git', ['ls-files', 'src/*.ts', 'src/*.tsx'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

/** Files whose shipped text mentions our channel URL. */
const filesShowingChannel = (): { path: string; text: string }[] =>
  sourceFiles()
    .map((p) => ({ path: p, text: shipped(readFileSync(`${ROOT}${p}`, 'utf8')) }))
    .filter(({ text }) => text.includes('PESA_SMART_CHANNEL') || text.includes(PESA_SMART_CHANNEL));

describe('the Pesa Smart channel is presented honestly', () => {
  it('is a different channel from CBK, not a re-label of it', () => {
    expect(PESA_SMART_CHANNEL).not.toBe(CBK_WHATSAPP_CHANNEL);
    expect(PESA_SMART_CHANNEL).toMatch(/^https:\/\/whatsapp\.com\/channel\/[A-Za-z0-9]+$/);
  });

  it('is actually shown somewhere, so the checks below are not vacuous', () => {
    // Every assertion here quantifies over the files that show the link. If
    // that set were empty they would all pass while the channel was unreachable
    // from the app — the failure mode that makes a guard worse than none.
    expect(filesShowingChannel().length, 'nothing in src/ links the channel').toBeGreaterThan(2);
  });

  it('names itself wherever it appears, so it cannot be mistaken for CBK', () => {
    for (const { path, text } of filesShowingChannel()) {
      expect(
        text.includes('PESA_SMART_NAME') || text.includes(PESA_SMART_NAME),
        `${path} links our channel without naming it — beside CBK's link that is a reader mistaking commentary for an announcement`
      ).toBe(true);
    }
  });

  it('never offers personal holdings alerts over the channel', () => {
    /* The claim that would require collecting holdings, and would contradict
     * the alerts page in the same breath. Matched near the word WhatsApp or
     * the channel name so ordinary on-device coupon copy is untouched. */
    const FORBIDDEN: { pattern: RegExp; because: string }[] = [
      {
        pattern: /\b(your|their)\s+(coupons?|maturit\w+|holdings?|portfolio)\b[^.]{0,80}\bwhatsapp\b/i,
        because: 'sending a reader their own coupon dates needs holdings this app never receives',
      },
      {
        pattern: /\bwhatsapp\b[^.]{0,80}\b(your|their)\s+(coupons?|maturit\w+|holdings?|portfolio)\b/i,
        because: 'same claim, written the other way round',
      },
    ];
    for (const { path, text } of filesShowingChannel()) {
      for (const { pattern, because } of FORBIDDEN) {
        const hit = text.match(pattern);
        expect(hit?.[0], `${path}: ${because}`).toBeUndefined();
      }
    }
  });

  it('is disclosed on the privacy page as an outbound destination', () => {
    // A new place we send readers is a change to the privacy story, not a
    // marketing detail. The page already lists where links go; ours belongs
    // in that list or the list is no longer true.
    const privacy = readFileSync(`${ROOT}src/app/privacy/page.tsx`, 'utf8');
    expect(privacy).toContain(PESA_SMART_NAME);
    expect(
      privacy,
      'the privacy page should say we cannot see who follows, which is the reason this route is safe to offer'
    ).toMatch(/does not show channel admins/i);
  });
});
