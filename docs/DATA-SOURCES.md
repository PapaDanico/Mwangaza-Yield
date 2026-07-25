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

✅ **CBK is reachable from code** — verified 2026-07-25 by running `validate.py` on a
network-open GitHub runner: all four CBK endpoints returned HTTP 200 with the expected
markers present. An earlier note here claimed CBK served 403 to non-browser clients; that
was **wrong**. The 403s came from the development sandbox's egress proxy, not from CBK.
Scrapers still send a browser User-Agent, which is harmless and polite.

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

Probed live 2026-07-25 (`discover_nse.py`). The free Daily Bond Price List is linked from
`nse.co.ke/bonds-statistics/` as:

```
https://www.nse.co.ke/wp-content/uploads/BondPrices_24-JUL-2026.pdf
"Download Daily Bond Price List"
```

Two consequences that killed the original design:

- **It is a PDF, not a spreadsheet.** `nse_parser.py` previously called
  `pd.read_excel()` and would have failed every single day.
- **The filename is date-stamped.** A fixed `NSE_DAILY_TRADE_URL` repo variable would go
  stale within 24 hours by construction, so that variable is **not used and should not be
  set**. The parser discovers the current link from the listing page on each run and reads
  the PDF with `pdfplumber` (already a dependency for CBK prospectuses).
- `NSE_BONDS_PAGE` overrides the listing page only if NSE relocates it.

### ⛔ The free list is not machine-readable

Inspected on the runner 2026-07-25:

```
=== PDF STRUCTURE: BondPrices_24-JUL-2026.pdf ===
  pages: 2
  page 1: 0 chars, 1 images, 0 tables   -> NO TEXT LAYER (scanned image)
  page 2: 0 chars, 1 images, 0 tables   -> NO TEXT LAYER (scanned image)
```

NSE publishes the Daily Bond Price List as **scanned images**. There is no text to
extract, so no parser can read it.

**We deliberately do not OCR it.** OCR confuses digits — 8/3, 5/6, 1/7 — and a misread
bond price is a wrong number presented with full confidence to someone deciding where to
put their savings. For this app that is a worse outcome than having no secondary-market
data, which is the current, clearly-labelled state.

`nse_parser.py` therefore checks for a text layer and **exits cleanly** when it finds
none: a known permanent limitation must not raise a daily alert, or people learn to
ignore alerts. The check remains in place so that if NSE ever publishes a text-layer PDF,
the scraper starts working by itself and we find out immediately.

**Routes to real secondary data, in order of preference:**
1. NSE's paid end-of-day feed via `dataservices@nse.co.ke` (licensed, machine-readable).
2. Ask NSE to publish the list as text — the underlying data is already digital.
3. Manual entry of the handful of actively traded issues.

Bulk end-of-day data remains a **paid subscription**; the dataservices page links only
policy and pricing PDFs.

## 3. KNBS — inflation

- Monthly CPI release: `knbs.or.ke/reports/consumer-price-indices-and-inflation-rates-<month>-<year>/`
- June 2026: **6.4% y/y**.

⚠️ **`knbs.or.ke` fails TLS verification** — verified 2026-07-25 on a network-open runner:
`SSLError(SSLCertVerificationError)`, an incomplete or invalid certificate chain on their
server. This is the one source of the seven that is not usable as-is.

**We do not disable certificate verification to work around it.** Silently trusting an
unverified certificate for data that drives investment decisions is a worse outcome than
using a different source. `macro_parser.py` therefore catches the SSL error explicitly and
falls back to CBK, which publishes the same headline inflation figure. If KNBS fixes its
chain, the primary path resumes automatically with no code change.

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

## 5. Source evaluation (July 2026)

A full, user-facing evaluation lives at `/sources/`. Summary of the decision rule:

**The binding constraint is that we ship as static files with no server.** No server means
no API keys, so any source requiring authentication can only run at build time in CI — and
any source whose licence forbids redistribution can only be linked, never mirrored.

| Source | Verdict | Reason |
|---|---|---|
| CBK, KNBS, National Treasury | **Integrated** | Public primary data, freely citable |
| World Bank Open Data | **Integrated** | Keyless, CORS-enabled, versioned JSON, CC BY 4.0 |
| NSE | Free daily list only | Bulk EOD data needs a commercial licence |
| IMF, broker research, press | Linked only | Copyrighted; cited for context, never republished |
| Trading Economics | Declined | API key required — impossible in a static client; redistribution outside ToS |
| Investing.com, yfinance | Declined | Unofficial or scraping-restricted endpoints; unsuitable for a money tool |
| CDSC | Declined | Participant-only data |

World Bank refresh runs in CI via `backend/scrapers/worldbank.py` (no secrets needed).

## 6. Live validation (2026-07-25)

`backend/scrapers/validate.py`, run via the `workflow_dispatch` → `validate-sources` job on
a GitHub runner (which, unlike the dev sandbox, has unrestricted egress):

| Source | Result |
|---|---|
| CBK home (CBR, FX) | ✅ 200, marker found |
| CBK treasury bonds | ✅ 200 |
| CBK prospectus list | ✅ 200 |
| CBK treasury bills | ✅ 200 |
| KNBS | ❌ TLS verification failure |
| NSE bonds statistics | ✅ 200 |
| World Bank API | ✅ 200, returned `{date: 2025, value: 4.633}` |

**6 of 7 usable as-is.** Re-run the job before trusting the pipeline after any long gap —
it checks not just reachability but whether each page still contains the marker its parser
depends on, which is how a scraper actually dies.

## 7. Monitoring and alerting

The pipeline fails in two ways, and only one is obvious.

**Hard failure** — a scraper crashes. Its CI step records the failure rather than
swallowing it.

**Silent staleness** — a scraper "succeeds" while extracting nothing. Because
`carry_forward()` preserves the previous values rather than deleting them, the output
still looks healthy while the app serves numbers that quietly age. `healthcheck.py`
catches this by asserting each dataset carries a recent date, with budgets matched to how
often each source actually publishes:

| Dataset | Field | Budget | Why |
|---|---|---|---|
| `meta.json` | `generatedAt` | 7d | refresh runs every weekday |
| `macro.json` | `date` | 40d | CPI is monthly |
| `tbills.json` | `auctionDate` | 21d | auctioned weekly |
| `secondary.json` | `tradeDate` | 30d | NSE publishes daily |
| `context.json` | `asOf` | 400d | annual indicators |

Freshness is read from **named date fields only**. An earlier version scanned the whole
JSON document and silently passed its own negative test, because ids like `fx-2026-07`
embed dates that do not track when a value was refreshed. A check that cannot fail is
worse than no check.

On failure the job opens a GitHub issue labelled `scraper-alert` with the failing
scrapers, the freshness report and a run link — commenting on the existing open issue
rather than stacking duplicates. It uses the built-in `GITHUB_TOKEN`: no secrets, no
third-party service, nothing to expire.

### Testing the alarm

Alerting that has never fired is an assumption. To prove it still works — do this after
any change to the health check or the alert step:

```
Actions → CI & Daily Data Refresh → Run workflow → test_alert: true
```

`HEALTHCHECK_STRICT=1` forces every budget to 0 days, so real data trips the real
staleness path: same report file, same exit code, same issue. Scrapers and the data
commit are skipped, so **nothing is written to the repository**. Close the resulting
issue afterwards.

Last proven working: 2026-07-25 (issue raised, then deduplicated to a comment on a
second run).
