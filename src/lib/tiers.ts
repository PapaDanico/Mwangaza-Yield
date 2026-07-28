/**
 * Mwangaza Yield does not sell anything to readers, and this file is why.
 *
 * THE POSITION
 * ------------
 * Every tool here — the calculator, the ladder, the auction record, the
 * portfolio tracker, the goal planners — is free to individuals, permanently,
 * with no tier above it. That is not a launch promotion and not a
 * generosity; it is the safest reading of Kenyan law as it now stands, and it
 * happens to agree with what this product is for.
 *
 * WHY, PLAINLY
 * ------------
 * The Capital Markets (Licensing Requirements)(General) Regulations 2025
 * widened the definition of an investment adviser to take in digital platforms
 * offering automated, algorithm-driven investment advice, and created a
 * licence category for web and mobile providers. This application is, on any
 * honest description, an algorithm applied to government securities.
 *
 * What keeps it outside that definition today is that it charges nobody, holds
 * nothing on anyone's behalf, recommends no purchase, and says so on every
 * page. Remuneration is a limb of the test in most jurisdictions that have
 * one. Putting a price on the output would remove the clearest thing standing
 * between this project and a licence obligation carrying a six-figure annual
 * fee and a professional-experience requirement.
 *
 * The sister product can sell documents because a household budget is not a
 * security. This one cannot, and pretending otherwise would be the single
 * most expensive mistake available.
 *
 * THIS IS NOT LEGAL ADVICE
 * ------------------------
 * It is a reading taken from secondary legal commentary, because the primary
 * text could not be retrieved when this was written. Before any of it is
 * relied upon, a Kenyan capital markets advocate should confirm it. If they
 * say the position is safe, this file should change deliberately, with their
 * opinion referenced — not because somebody found the constant inconvenient.
 */

/**
 * Capabilities a reader may ever be charged for.
 *
 * Deliberately empty, and it must stay that way until the paragraph above is
 * answered by somebody qualified. A test asserts the emptiness rather than
 * trusting this comment, because comments do not fail builds.
 */
export const CONSUMER_PAID_CAPABILITIES: readonly string[] = [];

/** Everything a reader can do here, all of it free. */
export const CONSUMER_CAPABILITIES = [
  'compute',
  'export-report',
  'save-plan',
  'alerts',
  'portfolio-import',
] as const;

export type ConsumerCapability = (typeof CONSUMER_CAPABILITIES)[number];

export function isFreeToReaders(capability: ConsumerCapability): boolean {
  return !CONSUMER_PAID_CAPABILITIES.includes(capability);
}

/* ------------------------------------------------------------- institutions */

/**
 * Where this product is funded from instead.
 *
 * Each of these is sold to an organisation that already holds whatever licence
 * its own activity requires. Supplying computation to a licensed firm is a
 * different act from advising the public, and it is the one this project can
 * do without becoming something it is not staffed to be.
 */
export interface InstitutionProduct {
  readonly id: string;
  readonly name: string;
  readonly buyer: string;
  readonly summary: string;
  /** What the buyer carries that we do not. */
  readonly theyHoldTheLicence: boolean;
}

export const INSTITUTION_PRODUCTS: readonly InstitutionProduct[] = [
  {
    id: 'engine-licence',
    name: 'Calculation engine, licensed',
    buyer: 'SACCOs, fund managers, investment advisers',
    summary:
      'The yield, ladder and cash-flow engine behind this site, under licence, for use inside your own advice process.',
    theyHoldTheLicence: true,
  },
  {
    id: 'white-label-reports',
    name: 'Reports in your own name',
    buyer: 'Brokers and advisers issuing client statements',
    summary:
      'The one-page ladder and goal reports, carrying your branding and your disclosures rather than ours.',
    theyHoldTheLicence: true,
  },
  {
    id: 'rates-feed',
    name: 'Computed rates feed',
    buyer: 'Anyone needing clean, derived CBK yield data',
    summary:
      'Treasury bill and bond yields solved from published CBK data, dated and machine-readable.',
    theyHoldTheLicence: false,
  },
];

/* --------------------------------------------------------------- narrative */

export const FUNDING_NARRATIVE = {
  heading: 'Free to read, funded by institutions',
  lead:
    'Everything on this site is free to you, permanently. There is no tier above it and no feature held back — what you can see is the whole product.',
  body: [
    'That is a deliberate choice rather than a stage we are passing through. Kenyan law treats algorithm-driven investment guidance carefully, and rightly so; charging individuals for it would change what this is. We would rather stay a place you can check a number than become a service that sells you an opinion.',
    'The work is instead funded by organisations who want the same calculations inside their own practice — SACCOs, fund managers and advisers who hold the licences their own advice requires. They pay for the engine; you pay nothing.',
  ],
  /**
   * Deliberately does NOT restate the not-advice disclaimer.
   *
   * `NOT_ADVICE` in provenance.ts is the site-wide wording and appears on every
   * report. A second disclaimer written in different words on the funding page
   * is two disclaimers that can drift apart, and the weaker one is the one a
   * reader will quote back. The page renders NOT_ADVICE itself; this covers
   * only what is specific to money changing hands.
   */
  reassurance:
    'We hold nothing on your behalf, take no commission from any issuer or intermediary, and cannot see your portfolio — it stays on your device. No part of this site becomes payable later.',
} as const;
