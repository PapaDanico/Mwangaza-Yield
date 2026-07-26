# Mwangaza Yield Engine — API reference

The licensable core of Mwangaza Yield: pricing, sale evaluation, and auction
bid guidance for Kenyan government securities, as a dependency-free TypeScript
library. Pure functions only — no I/O, no framework, no network. Callers bring
their own data in the shapes described under [Data contract](#data-contract).

```bash
npm run build:engine   # → dist/engine (ESM + type declarations)
npm run test:engine    # runs the built artifact against a real broker sheet
```

```js
import { analyseSale, bidGuidance, computeBondInvestment } from '@mwangaza/engine';
```

## Why this engine and not a generic bond library

Generic fixed-income libraries assume ACT/ACT or 30/360 day counts and miss
what the Kenyan market actually does. This engine's conventions were **derived
from the CBK dataset and independently confirmed against a real broker
contract note**, which the sell evaluator reproduces to the cent:

- **364-day year, 182-day coupon periods** (not 365/actual).
- **Withholding tax tiers**: IFBs exempt; ≥10-year originals 10%; shorter 15%.
- **Coupon paid at redemption**, including genuine short stubs.
- **Amortising IFBs** (partial principal repayments) supported in cashflows.
- **Auction re-openings** keep their original issue code, so tenor labels lie;
  bid guidance buckets on remaining term at the auction date.

## Modules

### Core pricing (`financial-engine`)

| Export | What it does |
|---|---|
| `computeBondInvestment(bond, faceKES, pricePer100, asOf?)` | Full investment result: gross/net YTM, cashflows, accrued, totals. |
| `solveYTMFromPrice(bond, pricePer100, settlement)` | Yield implied by a price (bisection; capped at `YTM_CEILING`). |
| `calculateAccruedInterest(bond, settlement)` | Accrued per 100 on the 182-day period. |
| `getCouponDates / getLastCouponDate / getNextCouponDate` | The coupon schedule, including the redemption coupon. |
| `determineWHTRate(bond)` | 0 / 0.10 / 0.15 per Kenyan WHT tiers. |
| `isYieldPinned(ytm)` | True when a solved yield hit the ceiling and must not be quoted. |
| `formatKES / formatPct / couponsByMonth` | Presentation helpers. |

### Sale evaluation (`sell`)

| Export | What it does |
|---|---|
| `analyseSale(bond, quote)` | Reconstructs a broker quote: accrued days/amount, clean price, consideration, net proceeds, the **effective sale yield after charges**, and the **break-even yield a replacement must gross** (tax-adjusted). Flags `quoteDisagrees` when the broker's price and yield don't reconcile. |
| `buildCashflows(bond, faceKES, settlement, amortisation?)` | Remaining cashflows, on the reduced balance after each amortisation step. |
| `remainingCouponDates(bond, settlement)` | Coupon dates still to come. |
| `findReplacements(bonds, breakEvenNet, priceOf, netYtmOf, excludeIsin)` | Bonds that clear the break-even bar today. |
| `verdict(analysis, bond, best)` | One-paragraph plain-language recommendation, naming the IFB tax trap when it applies. |

`SaleQuote.amortisation` is a list of `{ date, fraction }` principal
repayments. Getting this wrong is material: on the reference sheet, ignoring a
50% amortisation overprices the bond by 1.8 per 100 — about KES 7,300 on a
KES 400,000 trade.

### Auction bid guidance (`bid`)

| Export | What it does |
|---|---|
| `bidGuidance(prints, bonds, targetYears, opts?)` | Distribution (low/p25/median/p75/high) of clearing rates for paper of comparable **remaining term**, 2022+ only. Auto-widens tolerance 1.5→3→5y when thin, and says so. |
| `readBid(rate, guidance)` | Where a proposed rate sits: `aggressive` (risks rejection), `competitive`, `generous`, or `unknown` when the sample is too thin. |
| `yearsToMaturityAt(bond, date)` | Remaining term on the 364-day year. |
| `demandByAuction(prints)` | Bid-to-cover and acceptance rate **grouped per auction** — per-record division is meaningless and refused. |
| `describeDemand(demand)` | One plain-language line on recent demand. |
| `findComparables(...)` | The raw comparable set, with a count of records dropped for missing data. |

### Auction archive (`auction-history`)

`normaliseCode` (CBK writes `FXD1/2022/10` and `FXD1/2022/010` for the same
bond — and fractional tenors like `IFB1/2023/6.5` exist), `clearingRate`,
`historyFor`.

### Price resolution (`prices`)

`resolvePrice` (user > market > par, with provenance and staleness),
`isPlausiblePrice` (40–160 band), `summarisePriceCoverage`,
`describeProvenance`. Par is provenance-tagged so callers can refuse to treat
it as a market valuation — the app's portfolio does exactly that.

### Treasury bills (`tbills`)

`computeTBill`, `tbillPricePer100`, `projectRollover`, `bestTBill`
(`TBILL_WHT_RATE` = 15%).

## Data contract

All inputs are plain JSON-serialisable objects; the canonical shapes are the
exported types `Bond`, `AuctionPrint`, `SecondaryTrade`, `TBill`. Two fields
carry known traps, documented at their point of use:

- `AuctionPrint.amountOfferedKESM` is **per auction**, repeated on each bond
  in it — never divide a single record's bids by it.
- `Bond.tenorYears` is the label in the issue code, **not** the remaining term
  of a re-opening — use `yearsToMaturityAt` for anything comparative.

## Verification

- 430+ unit tests, including a suite pinned figure-by-figure to a real broker
  contract note (`tests/unit/sell.test.ts`) and mutation-tested bid-guidance
  traps (`tests/unit/bid.test.ts`).
- `npm run test:engine` exercises the **built artifact** — the thing a
  licensee receives — against the same external evidence.

## Licence

`UNLICENSED` — this library is the commercial product (see
`docs/BUSINESS-MODEL.md`, milestone M2). Contact the maintainer for terms.

## Known limits

- The engine does not *discover* amortisation schedules; callers must supply
  them (the public dataset has no such field — `docs/ROADMAP.md` §2b).
- Bid guidance quotes 2022+ history only; earlier archive coverage is patchy
  and is deliberately excluded from headline numbers.
- Prices are whatever the caller provides; the engine never fetches or
  redistributes market data, which is what keeps its sourcing clean.
