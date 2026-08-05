/**
 * What the feed page promises, in one place so a test can hold it to it.
 *
 * The failure this guards against is documentation drift: a page that tells a
 * third party to read `netEAY` from `tbills[0]` while the shipped `rates.json`
 * has since renamed or moved it. The reader finds out at the point they are
 * deciding whether to trust us, which is the worst possible moment — and it is
 * exactly what already happened once with the contract link that pointed into a
 * private repository and returned 404.
 *
 * So the field names the page advertises live here as data, and
 * `tests/unit/feed-page-contract.test.ts` asserts every one of them exists in
 * the shipped feed. Prose in a component cannot be checked; this can.
 */

import { APP_URL } from './share';

export const FEED_JSON_URL = `${APP_URL}/data/rates.json`;
export const FEED_CSV_URL = `${APP_URL}/data/rates.csv`;
export const FEED_CONTRACT_URL = `${APP_URL}/data/RATES-FEED.md`;

/**
 * The top-level keys the page names in prose. Anything listed here must exist
 * in rates.json, or the page is describing a feed we do not serve.
 */
export const DOCUMENTED_TOP_LEVEL = ['tbills', 'macro', 'bondAuctionBenchmarks', 'notes'] as const;

/** Fields named on the page or used by the snippet, per section. */
export const DOCUMENTED_FIELDS = {
  tbills: [
    'tenorDays',
    'quotedDiscountRate',
    'grossEAY',
    'netEAY',
    'pricePer100',
    'nextAuctionDate',
  ],
  macro: ['centralBankRate', 'inflation', 'inflationCore', 'inflationNonCore', 'usdKes'],
  bondAuctionBenchmarks: ['windowDays', 'minSample', 'bands'],
  notes: ['sourcing', 'tbills', 'conventions', 'warranty', 'attribution'],
} as const;

/**
 * The copy-paste example.
 *
 * Deliberately plain `fetch` with no framework, no build step and no key: the
 * point is that someone can paste it into a console on their own site and see a
 * number within seconds. It reads `netEAY` because that is the field a reader
 * should be using, and the example is where the default gets set.
 */
export const FEED_SNIPPET = `const res = await fetch('${FEED_JSON_URL}');
const feed = await res.json();

// Net yield after withholding tax — the number a saver actually receives.
for (const bill of feed.tbills) {
  console.log(\`\${bill.tenorDays}-day: \${bill.netEAY.toFixed(2)}% net\`);
}`;
