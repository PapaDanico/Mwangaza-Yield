/**
 * Publish what we actually know, in a shape somebody else can consume.
 *
 * WHY THIS EXISTS
 * ---------------
 * The engine's whole value is that it turns published CBK figures into the
 * number a person keeps — and CBK's own quotes are systematically misread.
 * A Treasury bill quoted at 8.7882% is not an 8.79% return: rolled four times
 * a year the true gross yield is 9.29%, and 15% withholding tax then pulls the
 * net to 7.86%. A consumer of "the 91-day rate" who multiplies capital by
 * 0.0879 is wrong twice over, in opposite directions, and lands roughly nine
 * tenths of a percentage point too high.
 *
 * The figures above were themselves wrong until 30 July 2026, on the pricing
 * convention rather than the arithmetic — see the header of src/lib/tbills.ts.
 * A quote that is already a yield was being treated as a discount on face,
 * which understated the price and so overstated the return, by 22bps at 91
 * days and 84bps at 364. That this file's own explanation of why others get
 * bills wrong contained a wrong figure is the argument for publishing one
 * answer rather than several, made against itself.
 *
 * Our sister product JiPange was making exactly that error in its DhowCSD
 * ladder, which is what prompted this file. The fix is not to teach JiPange
 * the formula — two copies of a convention drift, and the second copy is
 * never the one that gets corrected. The fix is for the side that owns the
 * verified maths to publish the ANSWER, and for everyone else to read it.
 *
 * That is also the licensable shape. docs/ROADMAP.md and the business model
 * both note that institutional demand is likelier to want figures than a
 * JavaScript import; this feed is that offer, and JiPange is its first
 * consumer — a reference integration we control on both ends.
 *
 * WHAT IS IN IT, AND WHAT DELIBERATELY IS NOT
 * -------------------------------------------
 * Only figures this project derives from published CBK/Treasury sources and
 * verifies with tests. No exchange-sourced prices (see the sourcing policy —
 * we publish none at all), no forecasts, and no bond-level yields, because a
 * current yield needs a current price and this project holds none. Where the
 * evidence is thin the field is absent rather than estimated.
 *
 * Run: npm run build:rates  (after npm run build:engine)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const E = await import('../dist/engine/lib/engine.js');
const P = await import('../dist/engine/lib/market-pulse.js');

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

const bills = read('public/data/tbills.json');
const macro = read('public/data/macro.json');
const prints = read('public/data/auction-results.json');
const bonds = read('public/data/bonds.json');
const meta = read('public/data/meta.json');

/** The dataset's own refresh stamp — not "now" — so the feed dates its EVIDENCE. */
const generatedAt = meta.generatedAt ?? new Date().toISOString();
const asOf = new Date(generatedAt);

const round = (n, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

/* ------------------------------------------------------------- T-bills */

const tbills = bills
  .map((b) => {
    // Yields do not depend on size; 100 face is just a convenient unit.
    const r = E.computeTBill(100, b.discountRate, b.tenorDays);
    return {
      tenorDays: b.tenorDays,
      /** What CBK publishes. NOT a return — see grossEAY. */
      quotedDiscountRate: round(b.discountRate),
      /** Effective annual yield before tax: the discount earned on the price paid. */
      grossEAY: round(r.grossEAY),
      /** What the holder keeps after 15% withholding tax. Use THIS to project income. */
      netEAY: round(r.netEAY),
      whtRate: E.TBILL_WHT_RATE,
      pricePer100: round(r.pricePer100),
      auctionDate: b.auctionDate,
      nextAuctionDate: b.nextAuctionDate ?? null,
      minInvestmentKES: b.minInvestmentKES ?? null,
      source: b.source ?? null,
    };
  })
  .sort((a, b) => a.tenorDays - b.tenorDays);

/* --------------------------------------------------------------- macro */

const pickMacro = (indicator) => {
  const rows = macro.filter((m) => m.indicator === indicator);
  if (!rows.length) return null;
  const latest = rows.sort((a, b) => b.date.localeCompare(a.date))[0];
  return {
    value: latest.value,
    unit: latest.unit,
    // `date` is when the FIGURE last changed; `lastChecked` is when we last
    // confirmed it. Publishing only the first made an unchanged number look
    // ancient; publishing only the second — which is what this feed used to
    // do — made it look observed this morning. A consumer needs both to say
    // "still 6.41% as of today" rather than guessing which it means.
    date: latest.date,
    lastChecked: latest.lastChecked ?? latest.date,
    // Records written before `fallback` existed encode it in the source
    // string as "CBK (KNBS unavailable)". Reading only the new field would
    // have published `fallback: false` directly above that very string — a
    // flatter contradiction than the one this change set out to fix. The
    // legacy shape is understood until the next scrape rewrites it.
    source: String(latest.source ?? "").replace(/\s*\(.*unavailable\)\s*/i, "").trim(),
    fallback: latest.fallback === true || /unavailable/i.test(String(latest.source ?? "")),
  };
};

/* ----------------------------------------------- bond auction benchmarks */

// Median clearing rates from the last 12 months, bucketed by REMAINING term
// at the auction — never the tenor printed in the issue code, which stays
// fixed for life even when a "15-year" bond is re-opened with five years to
// run. Bands with too little evidence carry a null median and their count,
// so a consumer can see the gap rather than infer a number from silence.
const benchmarks = P.recentClearingByTerm(prints, bonds, asOf).map((band) => ({
  label: band.label,
  fromYears: band.fromYears,
  toYears: band.toYears,
  auctions: band.count,
  medianClearingRate: band.median === null ? null : round(band.median, 3),
  lowClearingRate: band.low === null ? null : round(band.low, 3),
  highClearingRate: band.high === null ? null : round(band.high, 3),
  latestAuctionDate: band.latestDate,
}));

const demand = P.demandPulse(prints, asOf);

/* ---------------------------------------------------------------- write */

const feed = {
  // Bump only on a BREAKING change; additive fields do not move it. Consumers
  // should refuse a schema they do not know rather than guess at it.
  schema: 1,
  generatedAt,
  publisher: 'Mwangaza Yield',
  homepage: 'https://mwangazayield.org',
  /**
   * Read this before using the numbers. It travels inside the file on purpose:
   * a figure that outlives its caveats is how a careful calculation becomes a
   * careless claim somewhere downstream.
   */
  notes: {
    sourcing:
      'Derived from published Central Bank of Kenya and National Treasury releases. '
      + 'No exchange-sourced or secondary-market prices are included, published or implied.',
    tbills:
      'quotedDiscountRate is CBK\'s published quote and is NOT a return. Project income '
      + 'from netEAY; compare against other net-of-tax yields only.',
    conventions:
      'T-bills: price = 100 / (1 + rate x days / 365) per 100 face — CBK\'s quote is a '
      + 'simple annual yield on the price paid, not a discount on face, and reproduces '
      + 'CBK\'s own published price line exactly. EAY compounds that over a year. '
      + 'Bonds: 364-day year, 182-day coupon '
      + 'periods, WHT 0% on infrastructure bonds, 10% at ten years or longer, else 15%.',
    benchmarks:
      'Bond bands are bucketed by REMAINING term at the auction date, not the tenor in '
      + 'the issue code — most recent auctions are re-openings whose label understates '
      + 'nothing and overstates plenty. A null median means too few auctions to quote.',
    warranty:
      'Public information provided as-is for education, not investment advice and not a '
      + 'warranty of accuracy. Verify against the official prospectus before committing funds.',
    attribution: 'Attribution requested: "Rates via Mwangaza Yield (mwangazayield.org)".',
  },
  tbills,
  macro: {
    centralBankRate: pickMacro('CBR'),
    inflation: pickMacro('CPI'),
    /* ADDITIVE, so the schema does not move — consumers that do not know these
     * fields ignore them and keep working.
     *
     * Published because the headline alone misleads the households it matters
     * most to. KNBS splits the basket into core (81.1% of it) and non-core,
     * which is mostly food and energy. In July 2026 that was 3.2% against
     * 15.0%: a small, violently moving fifth doing nearly all the work.
     *
     * JiPange deflates a THIRTY-YEAR retirement plan by the headline, which is
     * where this error compounds worst. A reader whose spending is food and
     * transport heavy is not experiencing 6.5%, and their real return is
     * correspondingly worse than either product shows. Publishing the split is
     * what lets the sister product say so without hardcoding two numbers that
     * would drift the moment KNBS publishes again. */
    inflationCore: pickMacro('CPI_CORE'),
    inflationNonCore: pickMacro('CPI_NONCORE'),
    usdKes: pickMacro('FX_USD_KES'),
  },
  bondAuctionBenchmarks: {
    windowDays: P.PULSE_WINDOW_DAYS,
    minSample: P.MIN_BUCKET_SAMPLE,
    bands: benchmarks,
    demand: demand
      ? {
          auctions: demand.auctions,
          medianCoverRatio: round(demand.medianCover, 3),
          medianAcceptanceRate: round(demand.medianAcceptance, 3),
        }
      : null,
  },
};

writeFileSync('public/data/rates.json', JSON.stringify(feed, null, 2) + '\n');

/* ------------------------------------------------------------------ CSV */

/**
 * The same figures, in the format the buyer actually uses.
 *
 * docs/REVENUE.md §2 names this as the gap between a packaged engine and a
 * sellable one: the analyst evaluating this works in Excel, not in
 * `npm install`. A JSON feed asks them to write a parser before they can see
 * whether the numbers are any good; a CSV they can open is the difference
 * between a demo and a document they can check against their own book.
 *
 * Deliberately one flat table rather than a faithful serialisation of the
 * JSON. Nested structures do not survive a spreadsheet, and a file that opens
 * wrong is worse than no file. T-bills and bond bands share a `series` column
 * so both fit one sheet; the caveats travel in a header block, because a
 * figure that outlives its caveats is how a careful calculation becomes a
 * careless claim somewhere downstream.
 */
const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csvRows = [
  ['# Rates via Mwangaza Yield (mwangazayield.org)'],
  [`# Generated ${generatedAt} | schema ${feed.schema}`],
  [`# ${feed.notes.sourcing}`],
  [`# T-BILLS: ${feed.notes.tbills}`],
  [`# BANDS: ${feed.notes.benchmarks}`],
  [`# ${feed.notes.warranty}`],
  [],
  [
    'series', 'label', 'tenorDays', 'fromYears', 'toYears',
    'quotedDiscountRate', 'grossRate', 'netRate', 'whtRate',
    'sampleSize', 'lowRate', 'highRate', 'asOf', 'source',
  ],
];

for (const b of tbills) {
  csvRows.push([
    'tbill', `${b.tenorDays}-day Treasury bill`, b.tenorDays, '', '',
    b.quotedDiscountRate, b.grossEAY, b.netEAY, b.whtRate,
    '', '', '', b.auctionDate, b.source ?? 'CBK',
  ]);
}

for (const band of benchmarks) {
  csvRows.push([
    'bondAuctionBand', band.label, '', band.fromYears, band.toYears,
    '', band.medianClearingRate, '', '',
    band.auctions, band.lowClearingRate, band.highClearingRate,
    band.latestAuctionDate, 'CBK auction results',
  ]);
}

for (const [key, m] of Object.entries(feed.macro)) {
  if (!m) continue;
  csvRows.push([
    'macro', key, '', '', '', '', m.value, '', '', '', '', '', m.date, m.source,
  ]);
}

writeFileSync(
  'public/data/rates.csv',
  csvRows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
);

const t = tbills.map((x) => `${x.tenorDays}d net ${x.netEAY}%`).join(', ');
const quotable = benchmarks.filter((x) => x.medianClearingRate !== null).length;
console.log(`rates feed: ${t} | ${quotable}/${benchmarks.length} bond bands quotable`);
