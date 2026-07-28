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
 * WHY, IN THE WORDS OF THE STATUTE
 * -------------------------------
 * The Capital Markets Act, Cap 485A, s.2 defines the term:
 *
 *   "Investment adviser" means any person (other than a bona fide officer,
 *   director, trustee, member of an advisory board or employee of a company as
 *   such) who, FOR REMUNERATION —
 *     (a) carries on the business of advising others concerning securities; or
 *     (b) as part of a regular business, issues or promulgates analyses or
 *         reports concerning securities.
 *
 * Two things follow, and they decide this file.
 *
 * FIRST: "for remuneration" is an element of the definition, not a factor
 * weighed against others. A service that charges nothing is outside the
 * definition on its face. That is the whole reason this product can exist
 * without a licence.
 *
 * SECOND, and less comfortable: limb (b) describes what this application does
 * almost word for word. It issues analyses and reports concerning securities,
 * as a regular business. The ONLY element missing is remuneration. There is no
 * argument left in reserve — no "but it is educational", no "but it is
 * generic". Charge, and the definition is met in full.
 *
 * The 2025 Licensing Regulations then add a licence category for digital and
 * robo-advisory providers, so the obligation has an obvious home to land in.
 *
 * VOLUNTARY CONTRIBUTIONS COUNT AS REMUNERATION FOR THIS PURPOSE
 * -------------------------------------------------------------
 * Which is why there is no contribution path here, and none may be added.
 * The sister product asks for a voluntary payment beside a document it has
 * already given away free; that is safe THERE because a household budget is
 * not a security. Doing the same thing beside a bond ladder report would
 * invite an argument that the reports are issued for remuneration, and the
 * argument would not be a weak one. A donate button is cheap to add and would
 * put the whole position in play.
 *
 * WHAT REMAINS FOR AN ADVOCATE
 * ----------------------------
 * The institutional line below IS remunerated. The distinction relied on is
 * that the payer is a licensed firm buying computation for its own advice
 * process, not a member of the public buying advice. That reading is sound but
 * it is a reading, and it is the one question worth paying a Kenyan capital
 * markets advocate to answer properly.
 *
 * The statutory text above was read from a search index rather than from Kenya
 * Law directly, which this environment cannot reach. Verify the current
 * consolidated wording before relying on it.
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
