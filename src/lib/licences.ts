/**
 * What this project is actually allowed to republish, and on whose word.
 *
 * WHY A REGISTRY AND NOT A DOCUMENT
 * ---------------------------------
 * The licence position has been settled twice by research and both times it
 * lived in prose — a paragraph in DATA-SOURCES.md that no code reads. A
 * document cannot stop a scraper adding a source, and the failure mode is
 * silent in the worst way: the figure is correct, the citation is present, the
 * page looks scrupulous, and the data is being redistributed without the right
 * to redistribute it.
 *
 * So the verdicts live here, every shipped record's `source` string must
 * resolve to one of them, and a test refuses the build otherwise. That turns
 * research into an invariant rather than a note that drifts.
 *
 * THE FINDING THAT MADE THIS URGENT
 * ---------------------------------
 * "It is government data, so it is public" is FALSE IN KENYA. There is no
 * Kenyan equivalent of the US federal public-domain rule. The Copyright Act
 * No. 12 of 2001 confers copyright on works made pursuant to a government
 * commission for fifty years from first publication, and the Statistics Act
 * No. 4 of 2006 gives KNBS a mandate to PUBLISH — which is not a grant of
 * reuse rights to anyone else. The Kenya Open Data Initiative that would have
 * supplied an open licence has been offline for years.
 *
 * The practical consequence is uncomfortable and worth stating plainly: KNBS
 * originates Kenya's CPI, and KNBS is the one source here that reserves its
 * rights. The route through it is CBK, which republishes the same figures
 * under a notice that does grant reproduction. That is not a workaround; it is
 * citing the publisher whose terms we can actually satisfy.
 *
 * HOW TO ADD A SOURCE
 * -------------------
 * Find the operative sentence, quote it in `terms`, link it, date the check.
 * If you cannot find one, the verdict is `unknown` and the source cannot ship.
 * `unknown` is the honest answer and it is not a soft no — an unverified
 * licence and a refused one have the same consequence for a reader who trusts
 * this app to have checked.
 */

export type Verdict =
  /** Redistribution permitted; `attribution` is the required string. */
  | 'permitted'
  /** Explicitly refused, or rights reserved with permission required. */
  | 'refused'
  /** No operative terms found. Treated as refused for shipping purposes. */
  | 'unknown';

export interface Licence {
  /** The `source` prefix as it appears in shipped data records. */
  id: string;
  verdict: Verdict;
  /** Short licence name, e.g. "CC BY 4.0", or a description of the grant. */
  licence: string;
  /** The operative sentence, quoted. Empty when the verdict is `unknown`. */
  terms: string;
  /** Where that sentence was read. */
  termsUrl: string;
  /** What must accompany a republished figure. */
  attribution: string;
  /** ISO date the terms were last checked. Verdicts go stale. */
  checkedOn: string;
}

/**
 * The registry.
 *
 * Ordered most-permissive first, which is also roughly the order a new
 * indicator should be sourced in: prefer a body that has granted reuse in
 * writing over one that merely has not refused.
 */
export const LICENCES: Licence[] = [
  {
    id: 'World Bank Open Data',
    verdict: 'permitted',
    licence: 'CC BY 4.0',
    terms:
      'Most World Bank open data is available under the Creative Commons ' +
      'Attribution 4.0 International licence, permitting commercial reuse and ' +
      'redistribution with attribution.',
    termsUrl: 'https://datacatalog.worldbank.org/public-licenses',
    attribution: 'World Bank Open Data (CC BY 4.0)',
    checkedOn: '2026-08-16',
  },
  {
    id: 'AfDB Open Data for Africa',
    verdict: 'permitted',
    licence: 'CC BY 4.0',
    terms:
      'All data and datasets published by the Africa Development Bank Group ' +
      '(AfDB) on this Open Data Portal are provided under the Creative ' +
      'Commons Attribution 4.0 International License (CC-BY 4.0).',
    termsUrl: 'https://dataportal.opendataforafrica.org/legal/termsofuse',
    attribution:
      'African Development Bank Group, Open Data for Africa (CC BY 4.0)',
    checkedOn: '2026-08-16',
  },
  {
    id: 'National Treasury',
    verdict: 'permitted',
    licence: 'Reproduction without restriction, attribution required',
    terms:
      'Information contained in this publication may be reproduced without ' +
      'restriction provided due acknowledgement is made of the source.',
    termsUrl: 'https://www.treasury.go.ke/quarterly-economic-budgetary-review-qebr/',
    attribution:
      'The National Treasury and Economic Planning, Republic of Kenya',
    checkedOn: '2026-08-16',
  },
  {
    id: 'CBK',
    verdict: 'permitted',
    licence: 'Reproduction without restrictions, attribution required',
    terms:
      'Information in this publication may be reproduced without restrictions ' +
      'provided the source is duly acknowledged.',
    termsUrl: 'https://www.centralbank.go.ke/releases/quarterly-economic-review/',
    attribution: 'Central Bank of Kenya',
    checkedOn: '2026-08-16',
  },
  {
    id: 'IMF',
    verdict: 'permitted',
    licence: 'IMF Data terms — redistribution permitted with attribution',
    terms:
      'Users may download, extract, copy, create derivative works, publish, ' +
      'distribute and sell Data obtained from IMF Sites, subject to the ' +
      'following conditions: When Data is distributed or reproduced, it must ' +
      'appear accurately and attributed to the IMF as the source.',
    termsUrl: 'https://www.imf.org/en/about/copyright-and-terms',
    attribution: 'International Monetary Fund',
    checkedOn: '2026-08-16',
  },

  // --- refused ---------------------------------------------------------
  {
    id: 'KNBS',
    verdict: 'refused',
    licence: 'All rights reserved; written permission required',
    terms:
      'No part of this publication may be reproduced, distributed, or ' +
      'transmitted in any form or by any means ... without the prior written ' +
      'permission of the Bureau. Any copyright use requests relating to this ' +
      'publication should be addressed to the Director General.',
    termsUrl:
      'https://www.knbs.or.ke/wp-content/uploads/2023/12/2023-Statistical-Abstract-Final-PDF_2.pdf',
    attribution: '',
    checkedOn: '2026-08-16',
  },
  {
    id: 'NSE',
    verdict: 'refused',
    licence: 'Proprietary; redistribution not permitted',
    terms:
      'Standing project constraint: the Exchange does not permit free ' +
      'redistribution of its data.',
    // Deliberately not a link to the Exchange. tests/unit/no-exchange-data.ts
    // fails the build on any reference to that host anywhere in the tree, and
    // it caught this entry when it was first written — which is the guard
    // working, not a nuisance. The constraint is enforced there; this row
    // exists so the verdict is visible beside the others rather than living
    // only in a test.
    termsUrl: '',
    attribution: '',
    checkedOn: '2026-08-16',
  },
  {
    id: 'Trading Economics',
    verdict: 'refused',
    licence: 'Personal, non-transferable licence only',
    terms:
      'Trading Economics grants you a limited, personal, nontransferable, ' +
      'revocable license to analyse data ...',
    termsUrl: 'https://tradingeconomics.com/terms.aspx',
    attribution: '',
    checkedOn: '2026-08-16',
  },
  {
    id: 'FocusEconomics',
    verdict: 'refused',
    licence: 'Non-sublicensable licence; redistribution prohibited',
    terms:
      'Any use of the Material through whatever mechanism not expressly ' +
      'authorized by FocusEconomics in these Terms & Conditions is expressly ' +
      'prohibited.',
    termsUrl: 'https://www.focus-economics.com/terms-and-conditions/',
    attribution: '',
    checkedOn: '2026-08-16',
  },
  {
    id: 'investing.com',
    verdict: 'refused',
    licence: 'Redistribution expressly prohibited',
    terms:
      'Users will not "deep-link", redistribute or facilitate the ' +
      'redistribution of Market Information.',
    termsUrl: 'https://www.investing.com/about-us/terms-and-conditions',
    attribution: '',
    checkedOn: '2026-08-16',
  },
  {
    id: 'CEIC',
    verdict: 'refused',
    licence: 'Subscriber-only; external distribution prohibited',
    terms:
      'CEIC subscribers may not rent, transfer, publish, duplicate or in any ' +
      'way distribute the database information or allow third-party access to ' +
      'CEIC data.',
    termsUrl: 'https://www.ceicdata.com/en/terms-and-conditions',
    attribution: '',
    checkedOn: '2026-08-16',
  },
];

/**
 * The licence governing a record's `source` string, or null if unregistered.
 *
 * Matching is by PREFIX, because shipped records carry qualified sources —
 * "CBK auction, 30 Jul 2026", "World Bank Open Data (CC BY 4.0)" — and the
 * licence attaches to the body, not the qualifier. Longest match wins so a
 * more specific registration cannot be shadowed by a shorter one.
 */
export function licenceFor(source: string): Licence | null {
  const s = source.trim();
  let best: Licence | null = null;
  for (const l of LICENCES) {
    if (s.toUpperCase().startsWith(l.id.toUpperCase())) {
      if (!best || l.id.length > best.id.length) best = l;
    }
  }
  return best;
}

/** Whether a source string may be republished by this project. */
export function mayRedistribute(source: string): boolean {
  return licenceFor(source)?.verdict === 'permitted';
}

/**
 * Sources known to be shipping without the right to ship them.
 *
 * An exception with no expiry is how an exposure becomes permanent, so each
 * carries the date it must be resolved by and the test below fails once that
 * date passes. Fixing one means re-deriving the figure from a source whose
 * terms we can satisfy — NOT relabelling it, which would swap a licence
 * problem for a false citation and make the app less honest, not more.
 */
export interface KnownExposure {
  /** The exact `source` string as shipped. */
  source: string;
  /** Where it appears. */
  file: string;
  /** What has to happen. */
  remedy: string;
  /** ISO date after which this test fails rather than tolerating it. */
  resolveBy: string;
}

export const KNOWN_EXPOSURES: KnownExposure[] = [
  {
    source: 'KNBS Consumer Price Indices and Inflation Rates, July 2026',
    file: 'public/data/macro.json',
    remedy:
      'Core (3.2%) and non-core (15.0%) CPI are cited to KNBS, which reserves ' +
      'all rights. CBK republishes both in its MPC press release under a ' +
      'notice that does grant reproduction. Re-derive them from the CBK ' +
      'release on the next refresh and cite CBK — the same route the headline ' +
      'CPI already takes, and the one provenance.ts documents. Do not simply ' +
      'change the label: an unverified attribution is a worse defect than an ' +
      'unlicensed one.',
    resolveBy: '2026-11-16',
  },
];
