# The Mwangaza Yield rates feed

A published JSON file of Kenyan government-securities figures, computed by the
same verified engine that powers the app.

```
GET https://mwangazayield.org/data/rates.json
```

Cross-origin reads are enabled and the file is cached for 15 minutes. It is
rebuilt every morning by the same CI job that refreshes the underlying data.

## Or as a spreadsheet

```
GET https://mwangazayield.org/data/rates.csv
```

The same figures as one flat table, generated from the same build step and
pinned to the JSON by `tests/unit/rates-csv.test.ts` so the two cannot drift.
It exists because the person evaluating these numbers usually works in Excel,
not in `npm install` — a JSON feed asks them to write a parser before they can
check a single figure against their own book.

Deliberately not a faithful serialisation of the JSON: nested structures do not
survive a spreadsheet, so T-bills, bond auction bands and macro readings share
one `series` column and one set of rate columns. Every row carries its own
date and source, and the caveats travel as a comment block above the header
rather than in a separate document.

A blank rate cell means **we have too little evidence to quote one**. It is
never a zero — a zero in a rate column is a claim.

## Why this exists

CBK's published quote for a Treasury bill is a **discount rate**, and it is
neither the return nor close to it. A bill quoted at 8.7986% earns its discount
on a smaller outlay, so the true gross yield is 9.30% — then 15% withholding
tax pulls the net to 7.87%. Anyone multiplying capital by `0.088` is wrong
twice in opposite directions and lands roughly three quarters of a percentage
point too high.

Publishing the answer rather than the formula is deliberate. Two copies of a
convention drift apart, and the second copy is never the one that gets
corrected when the convention turns out to be subtle.

## Shape

```jsonc
{
  "schema": 1,                     // refuse a version you don't know
  "generatedAt": "2026-07-25T…",   // when the EVIDENCE was refreshed, not the build
  "publisher": "Mwangaza Yield",
  "homepage": "https://mwangazayield.org",
  "notes": {                       // caveats travel inside the file
    "sourcing":    "…",            // where the numbers come from
    "conventions": "…",            // how a CBK quote becomes a yield
    "benchmarks":  "…",            // what the auction bands do and don't mean
    "attribution": "…"             // how to credit the feed
  },

  "tbills": [
    {
      "tenorDays": 91,
      "quotedDiscountRate": 8.7986, // CBK's quote — NOT a return
      "grossEAY": 9.3043,           // effective annual yield, before tax
      "netEAY": 7.8688,             // ← project income from THIS
      "whtRate": 0.15,
      "pricePer100": 97.8064,
      "auctionDate": "2026-07-16",
      "nextAuctionDate": "2026-07-30",
      "minInvestmentKES": 100000,
      "source": "CBK auction, 16 Jul 2026"
    }
  ],

  "macro": {
    "centralBankRate":   { "value": 8.75, "unit": "%", "date": "…", "source": "CBK MPC" },
    "inflation":         { "value": 6.5,  "unit": "% y/y", … },   // headline, KNBS
    "inflationCore":     { "value": 3.2,  "unit": "% y/y", … },   // ex food & energy
    "inflationNonCore":  { "value": 15.0, "unit": "% y/y", … },   // mostly food & energy
    "usdKes":            { "value": 129.5, … }
  },

  // Every macro reading carries `fallback: true` when a substitute source stood
  // in for the authoritative one. Treat a fallback reading as indicative and
  // say so to your own users, as we do.
  //
  // WHY THE INFLATION SPLIT IS PUBLISHED
  //
  // The headline is a weighted average of the two, and core is about 81% of the
  // basket — so a small, fast-moving fifth drives most of the movement. In July
  // 2026 the headline was 6.5% with core at 3.2% and non-core at 15.0%.
  //
  // This matters if you deflate anything by the headline. A household whose
  // spending is mostly food and transport is not experiencing the headline
  // rate, and any real return you show them is correspondingly overstated. The
  // split is here so you can say that without hardcoding two numbers that go
  // stale the next time KNBS publishes.
  //
  // These fields were added after schema 1 shipped. They are ADDITIVE: a
  // consumer that does not know them ignores them and keeps working, which is
  // why the schema version does not move.

  "bondAuctionBenchmarks": {
    "windowDays": 365,
    "minSample": 3,
    "bands": [
      {
        "label": "7–12y",
        "fromYears": 7, "toYears": 12,
        "auctions": 15,
        "medianClearingRate": 12.99,  // null when auctions < minSample
        "lowClearingRate": 11.69,
        "highClearingRate": 14.12,
        "latestAuctionDate": "2026-06-15"
      }
    ],
    "demand": { "auctions": 26, "medianCoverRatio": 1.4, "medianAcceptanceRate": 0.7 }
  }
}
```

## Reading it correctly

**Use `netEAY` to project income.** It is what the holder keeps. Comparing it
against another product's *gross* figure is the commonest way to reach a wrong
conclusion — money-market funds and SACCO dividends are usually quoted before
tax, T-bills here are after.

**Bond bands are bucketed by remaining term at the auction date**, not the
tenor printed in the issue code. Most recent auctions are re-openings, and a
"15-year" bond re-opened with five years to run is five-year paper however it
is labelled. A `null` median means the band had too few auctions to quote —
show the gap, don't fill it.

**Demand is grouped per auction.** CBK publishes the offer per auction and bids
per bond, and one auction routinely covers several bonds; dividing per row
produces a confident, meaningless number well below 1.0x.

**`generatedAt` dates the evidence, not the build.** A feed rebuilt from
unchanged scrapes carries the old stamp on purpose.

## What is deliberately absent

- **No exchange-sourced or secondary-market prices**, published or implied.
  The project holds none by policy.
- **No per-bond current yields.** A current yield needs a current price.
- **No forecasts.** The feed reports what auctions did, never what they will do.
- **No estimates in place of evidence.** Thin bands carry `null` and a count.

## Stability

`schema` moves only on a breaking change — a removed or re-typed field, or a
changed meaning. New fields may be added without a bump, so parse
permissively and refuse a `schema` you don't recognise.

## Terms

The underlying figures are public CBK and National Treasury releases. The feed
is provided as-is, for education, and is **not investment advice or a warranty
of accuracy** — verify against the official prospectus before committing funds.

Attribution requested: *"Rates via Mwangaza Yield (mwangazayield.org)"*.

Commercial integrations wanting guarantees, a fixed schedule, or figures beyond
this file should see [`BUSINESS-MODEL.md`](BUSINESS-MODEL.md) — the engine
behind the feed is licensable, and [`ENGINE-API.md`](ENGINE-API.md) documents
it.

## Reference integration

Our sister product [JiPange](https://jipangefinance.org) consumes this feed for
its DhowCSD T-bill ladder. It previously hardcoded the quoted discount rates
and projected income from them directly — overstating a KES 300,000 ladder by
about KES 2,300 a year. That is the error class this feed removes, and the
integration is kept in-tree as the worked example.
