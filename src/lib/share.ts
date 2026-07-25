// Shareable plain-text reports (WhatsApp is Kenya's default sharing channel)
// and the browser share/print entry points.

import { formatKES, formatPct } from './financial-engine';
import type { LadderPlan } from './ladder';

/**
 * Where the app lives.
 *
 * This string is the one people keep. It goes into every WhatsApp summary a
 * user forwards and into the link preview anyone sees before they ever open
 * the site — so it outlives any later change of address, and a link shared
 * today has to still work in a year. That is why it is the custom domain and
 * not the Netlify subdomain the project launched on.
 *
 * It was previously written out in three separate files. One definition, so a
 * future move cannot half-happen and leave shared links pointing at an address
 * the maintainer thought was retired.
 */
export const APP_URL = 'https://mwangazayield.org';

/** CBK publishes auction announcements here — the most reliable primary feed. */
export const CBK_WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029Va5HrcD4dTnNnTguwc24';

const FOOTER = 'via Mwangaza Yield — government bonds, made plain';

/**
 * WhatsApp renders *bold* and _italic_ from plain text, so summaries are
 * written to survive as text anywhere (SMS, email) but look right in chat.
 */
export function formatLadderSummary(plan: LadderPlan, appUrl: string): string {
  if (!plan.rungs.length) return `No ladder to share yet.\n\n${FOOTER}\n${appUrl}`;

  const rungs = plan.rungs
    .map(
      (r) =>
        `• ${r.bond.issueCode}${r.bond.taxExempt ? ' (tax-free)' : ''} — ${formatKES(
          r.faceValueKES
        )} @ ${formatPct(r.result.netYTM)} net, matures ${r.bond.maturityDate}`
    )
    .join('\n');

  const firstYear = plan.yearlyPayouts[0]?.year;
  const lastYear = plan.yearlyPayouts[plan.yearlyPayouts.length - 1]?.year;

  return [
    '*My Kenyan bond ladder*',
    '',
    `Invested: ${formatKES(plan.totalCostKES)}`,
    `Blended net yield: *${formatPct(plan.blendedNetYTM)}* (after withholding tax)`,
    `Net income: ${formatKES(plan.netAnnualIncomeKES)} per year`,
    firstYear ? `Payouts: ${firstYear}–${lastYear}` : '',
    '',
    rungs,
    '',
    FOOTER,
    appUrl,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatPortfolioSummary(
  totals: { cost: number; income: number; weightedNet: number },
  holdingsCount: number,
  appUrl: string
): string {
  return [
    '*My Kenyan bond portfolio*',
    '',
    `${holdingsCount} holding${holdingsCount === 1 ? '' : 's'}`,
    `Invested: ${formatKES(totals.cost)}`,
    `Weighted net yield: *${formatPct(totals.weightedNet)}* (after withholding tax)`,
    `Net income: ${formatKES(totals.income)} per year`,
    '',
    FOOTER,
    appUrl,
  ].join('\n');
}

/** Native share sheet where available (mobile), WhatsApp web link otherwise. */
export function shareText(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.share) {
    navigator.share({ text }).catch(() => {});
    return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/** Browser print dialog — users pick "Save as PDF" for the one-page report. */
export function printReport(): void {
  window.print();
}
