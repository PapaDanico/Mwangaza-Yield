/**
 * Publish what we actually know, in a shape somebody else can consume.
 *
 * WHY THIS EXISTS
 * ---------------
 * The engine's whole value is that it turns published CBK figures into the
 * number a person keeps — and CBK's own quotes are systematically misread.
 * A Treasury bill quoted at 8.7986% is neither an 8.80% return nor close to
 * one: the discount is earned on a smaller outlay, so the true gross yield is
 * 9.30%, and 15% withholding tax then pulls the net to 7.87%. A consumer of
 * "the 91-day rate" who multiplies capital by 0.088 is wrong twice over, in
 * opposite directions, and lands about three quarters of a percentage point
 * too high.
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
  return { value: latest.value, unit: latest.unit, date: latest.date, source: latest.source };
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
      'T-bills: discount = face x rate x days / 365, price = face - discount, '
      + 'EAY compounds that discount over a year. Bonds: 364-day year, 182-day coupon '
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

const t = tbills.map((x) => `${x.tenorDays}d net ${x.netEAY}%`).join(', ');
const quotable = benchmarks.filter((x) => x.medianClearingRate !== null).length;
console.log(`rates feed: ${t} | ${quotable}/${benchmarks.length} bond bands quotable`);
