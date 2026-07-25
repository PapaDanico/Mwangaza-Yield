# Data Source Map — Kenyan Government Bonds

Verified via web research on 2026-07-24. This is the authoritative reference for where
Mwangaza Yield's data comes from and how to refresh it.

## 1. CBK — primary issuance (authoritative)

| What | Where | Notes |
|---|---|---|
| Treasury bonds hub | `centralbank.go.ke/bills-bonds/treasury-bonds/` | Upcoming issues, results |
| Prospectus PDFs | `centralbank.go.ke/uploads/treasury_bonds_prospectuses/<id>_<MONTH> <YEAR> <CODES> DATED <DD-MM-YYYY>.pdf` | Discoverable via search/listing page; feed to `cbk_parser.py` |
| Prospectus listing | `centralbank.go.ke/securities/treasury-bonds/treasury-bonds-prospectuses/` | Scrape for new PDF links |
| CBR | `centralbank.go.ke/rates/central-bank-rate/` | MPC announcements |

⚠️ **CBK serves HTTP 403 to non-browser clients.** Scrapers must send a real browser
User-Agent; if that stops working, fall back to manual download + local parse. This is why
the pipeline treats scraping as best-effort with manual override.

## 1b. Treasury bills (CBK)

| What | Where |
|---|---|
| T-bill hub | `centralbank.go.ke/securities/treasury-bills/` |
| Weekly results PDFs | `centralbank.go.ke/uploads/{91,182,364}_day_historical_treasury_bill_results/…` |

- Tenors **91, 182, 364 days**; auctioned **weekly**, bids close **Thursday 2:00pm** via DhowCSD.
- Minimum **KES 100,000**, thereafter multiples of KES 50,000.
- **Discount convention (verified):** `Discount = Face × rate × days / 365`, `Price = Face − Discount`.
  Effective annual yield `= (Face / Price) ^ (365 / days) − 1`. The quoted discount rate is
  therefore always *below* the true gross yield.
- **WHT 15%** on bill interest, with no exemption equivalent to infrastructure bonds.
- ⚠️ The National Treasury announced from 2025 that the **364-day bill would be phased out** to
  shorten the debt profile, but it was still being auctioned as of July 2026. Treat its
  continued availability as needing re-checking each cycle rather than assumed.

Rates captured 16 Jul 2026 auction: 91d **8.7986%**, 182d **8.9695%**, 364d **9.0415%**
(KES 30.62B accepted on KES 44.02B bids, 157% performance).

## 2. NSE — secondary market

- Daily Bond Price List: `nse.co.ke/bonds-statistics/` (downloadable, format varies).
- Bulk end-of-day data (Excel/CSV) is a **paid subscription** via `dataservices@nse.co.ke`
  (`nse.co.ke/dataservices/`). The free daily price list is the realistic v1 source.
- Set the repo variable `NSE_DAILY_TRADE_URL` to the current price-list URL once confirmed.

## 3. KNBS — inflation

- Monthly CPI release: `knbs.or.ke/reports/consumer-price-indices-and-inflation-rates-<month>-<year>/`
- June 2026: **6.4% y/y**.

## 4. Aggregators (secondary confirmation only)

- Mansa Markets (`mansamarkets.com/kenya/bonds`), Kenyan Wallstreet, Serrari Group,
  Trading Economics. Useful to cross-check auction results; never the primary source.

## Market state captured 2026-07-24

- **CBR 8.75%** (MPC held, 2026-06-09 — record easing cycle from 13.0% in 2024).
- **CPI 6.4% y/y** (June 2026, KNBS).
- **USD/KES ≈ 129.5** (mid-July 2026).
- **July 2026 auction** (auction 08-07, settled 13-07, KES 70B target, KES 63.28B accepted):
  - FXD1/2022/010 — coupon 13.490%, ~5.8y remaining
  - FXD1/2021/020 — coupon 13.444%, ~15.2y remaining
  - FXD1/2026/030 — coupon 12.500%, ~29.9y remaining (first 30-year of 2026)
- **July 2026 reopen results** (FXD1/2019/020 coupon 12.873%; FXD1/2022/025 coupon
  14.188%): 25-year cleared at **WAY 14.4432%**, price 102.0829, bid-to-cover 1.21,
  NSE listing 27-07-2026.
- **IFBs** (WHT-exempt): Feb 2026 reopening was 427% oversubscribed (KES 213.7B bids vs
  50B offered). Recent IFB clearing yields ~13.5–16% by tenor. Issuance windows are
  typically Feb / May / Aug / Nov.
- **August 2026 prospectuses not yet published** as of 2026-07-24.

## Dataset provenance & accuracy notes

`public/data/*.json` is compiled from the public reports above. Coupons and auction
results are as reported; **maturity dates are approximated from issue codes and reported
remaining tenors** (CBK prospectuses are the exact source), and YTMs without a reported
auction print are estimates off the July 2026 curve. Every figure should be re-verified
against CBK before real money decisions — the in-app disclaimer says so too.
