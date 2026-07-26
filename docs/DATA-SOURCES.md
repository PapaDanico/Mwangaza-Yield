# Data Source Map — Kenyan Government Bonds

> ## ⛔ SUPERSEDING DECISION (2026-07-25): no NSE data, in any form
>
> **Mwangaza Yield uses no Nairobi Securities Exchange data.** Not the free daily list,
> not the dropdown tables, not by manual transcription on our side — none of it.
>
> Sections 2, 11 and parts of 5 below record the investigation that led here and are kept
> as history. **Where they describe routes to obtain exchange data, treat them as closed.**
> In particular, the earlier "route 1: personal use, by the user" is no longer part of the
> product: the app does not direct anyone to the Exchange, links to it nowhere, and its
> price book asks for the price the reader *paid or was quoted* by their broker or DhowCSD.
>
> The reasoning is that publicly reachable is not the same as freely redistributable. The
> terms make the data proprietary and forbid using it to build a product; being a small,
> well-intentioned user is not a licence. So the dependency was removed outright rather
> than managed: `nse_parser.py`, `discover_nse.py` and `discover_secondary_sources.py` are
> deleted, the CI steps that ran them are gone, `NSE_DAILY_TRADE_URL` is not read anywhere,
> and `validate.py` no longer probes an Exchange endpoint.
>
> **Everything the app publishes now comes from CBK, the National Treasury, KNBS and the
> World Bank.** `secondary.json` ships empty and stays that way.

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

## 2. NSE — secondary market (CLOSED — see the superseding decision at the top)

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
| `secondary.json` | `tradeDate` | 30d | empty by design; only checked if a deployer supplies a feed |
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


## 8. CBK Weekly Bulletin — CONFIRMED machine-readable (2026-07-25)

Probed with `discover_sources.py` on a network-open runner:

```
--- PDF: centralbank.go.ke/images/docs/weeklybulletin/2016/Jan/Weekly_Bulletin_-_January_15_2016.pdf
    pages: 7, 388465 bytes
    page 1: 915 chars, 2 images, 0 tables
    >>> TEXT LAYER PRESENT — machine-readable
    | CBK Weekly Statistical Bulletin of Key Monetary and Financial Indicators
    | The average interbank rate declined to 5.45 percent in the week ending...
```

**Usable.** Unlike the NSE price list, these carry a real text layer and can be parsed
with `pdfplumber`.

⚠️ **Two things to resolve before building on it:**

1. **The probe found 2016 archives**, not current bulletins — the URL pattern is
   `/images/docs/weeklybulletin/<YYYY>/<Mon>/Weekly_Bulletin_-_<Month>_<D>_<YYYY>.pdf`.
   The current-year listing page must be located before a scraper is written.
2. **It carries turnover, not prices.** The bulletin reports market activity —
   interbank rates, liquidity, bond turnover — not per-bond clean prices. It can enrich
   the sovereign-context panel; it does **not** solve the calculator's missing market
   prices. Those remain separate problems.

## 9. CMA — no machine-readable statistics found (2026-07-25)

```
https://www.cma.or.ke/statistics/         -> HTTP 404
https://www.cma.or.ke/market-statistics/  -> HTTP 404
https://www.cma.or.ke/                    -> HTTP 200, no matching PDFs linked
```

Their statistics are either at an undiscovered path or rendered client-side. Not
pursued further; revisit only if a specific document is identified by hand.

## 10. CBK MPC press table — CONFIRMED extractable, now live (2026-07-25)

The single most valuable finding of the July source review, and the one most likely to
have been got wrong by assumption.

**The question.** CBK's press listing renders a DataTables grid with Copy/CSV/Excel/PDF
export buttons and 127 entries across 13 pages. A screenshot shows the *UI*. It does not
show the *mechanism* — a CSV button is equally consistent with rows in the DOM, a JSON
endpoint, or client-side rendering that `requests` cannot see. Each needs a different
approach, and one of them is impossible without a headless browser.

**The probe** (`discover_cbk_tables.py`):

```
=== MPC Press Releases (CBR history) ===
  https://www.centralbank.go.ke/press/
  HTTP 200, 203660 bytes
  tables in DOM: 2
  DataTables present: True
  table 1: 301 rows in served HTML
  table 2: 129 rows in served HTML
    | 11/06/2008 | Inaugural Meeting of the Monetary Policy Committee
  >>> 120 CBR mentions found in HTML; distinct values:
      [18.0, 16.5, 13.0, 12.75, 12.5, 12.0, 11.5, 11.25, 11.0, 10.75, 10.5, 10.0, 9.75, 9.5, 9.25]
```

**Rows are in the served HTML.** No AJAX source is declared, no JavaScript is needed, no
OCR is involved. Plain `requests` + BeautifulSoup reads eighteen years of rate decisions.

**Captured** by `cbr_history_parser.py` into `public/data/cbr-history.json`:
119 decisions, **1 December 2008 → 9 June 2026**, spanning 5.75%–18.00%.

Three quirks the probe exposed, each handled explicitly:

| Quirk | Handling |
|---|---|
| Dates are `dd/mm/yyyy` | `24/02/2009` proves day-first; parsed as such, not guessed |
| Each decision appears in **two** tables | Deduplicated on ISO date |
| CBK's wording varies across 18 years ("Retains", "lowers", "lowered", "Committee retains") | Direction and basis-point change are **computed from the previous rate**, never parsed from the verb |

Two guards against silent corruption, both deliberate:

- Rates outside **3–25%** are dropped as misparses (Kenya's real range is 5.75–18.00).
- Fewer than **40 decisions** parsed is treated as a layout change and refuses to write.
  Replacing a full history with a plausible-looking stub is worse than failing outright —
  the stub would be believed.

`test_cbr_history.py` covers all of the above against a fixture built from the real
markup. It runs in CI on every pull request.

### Why this was worth doing

The app previously showed `CBR 8.75%` as a bare number. A number carries no information
about whether it is high or low, rising or falling. The path does: Kenya is **ten cuts
into an easing cycle from 13.00%, now held twice** — which is exactly the context a saver
needs before locking money away for ten years, because the policy rate anchors the whole
curve they are being quoted from.

**One correctness note.** The headline comparison is against the level the *current run*
started from (13.00%, June 2024), **not** the all-time high of 18.00% (December 2011).
Anchoring on the record would describe a 9.25-point easing that never happened as a
single move — it spans three separate cycles and fifteen years. The record high and low
are still shown, labelled as history rather than as cycle. See `analyseCycle` in
`src/lib/rate-cycle.ts`.

### Other CBK tables probed at the same time

| Page | Rows in served HTML | Verdict |
|---|---|---|
| Statistical Bulletin | 47 | Listing of PDF links only, no rate data inline |
| Monthly Economic Indicators | 104 | Listing of PDF links only |
| Weekly Bulletin | 934 | Listing only — the data is inside the PDFs (see §8) |

All three are link indexes rather than data tables. They remain useful for *discovering*
documents, which is how the Weekly Bulletin work in §8 would proceed.

## 11. Secondary-source shortlist — probed 2026-07-25

Evaluated against **two** questions, because the second one kills more candidates than
the first: *can software read it*, and *are we permitted to redistribute it*. This app
ships static files to the public, so "available" and "usable" are very different words.

| Source | Reachable | Machine-readable | Permitted | Verdict |
|---|---|---|---|---|
| KIPPRA | HTTP 200 | Prose + PDFs, 0 data tables | All rights reserved | **Cite and link** |
| Cbonds | HTTP 404 on the Kenya page | — | Paid subscription | **Declined** |
| AfricaFinancials | HTTP 403 to bots | — | — | **Declined** |
| Bloomberg | HTTP 403 to bots | — | Commercially licensed | **Declined** |
| NSE Data Services | HTTP 200, 6 tables, 32 rows in HTML | **Yes** | **No** | **Declined on terms** |

### The NSE dropdown: technically yes, legally no (CLOSED — no route is taken)

The Market Statistics page (Bonds Statistics tab, with the tenor dropdown — TWO YEAR
BONDS, and so on) does serve tables in plain HTML: **6 tables, 32 rows**, no OCR needed.
So the technical answer to "can we extract this?" is *largely yes*.

That is not the answer that matters. The same page carries this notice, and our probe
detected every one of these phrases in the served HTML:

> All data and information provided by the NSE … is **proprietary to the NSE**. You **may
> not copy, reproduce, modify, reformat, download, store, distribute, publish or transmit**
> any data and information, **except for your personal use**. For the avoidance of doubt,
> you **may not develop or create any product that uses, is based on, or is developed in
> connection with** any of the data and information available on this site. You are **not
> permitted** (except where you have been given express written permission by the NSE) to
> use the data and information for **commercial gain**.

Detected markers: `proprietary to`, `may not copy`, `except for your personal use`,
`not permitted`, `commercial gain`.

That prohibition is broader than redistribution. It forbids *building a product on* the
data at all. Scraping it would put the project — and anyone relying on it — in the wrong,
and a tool asking people to trust it with their savings cannot be casual about whose
rules it follows.

**Three legitimate routes remain, in order of preference:**

1. **Personal use, by the user.** The terms explicitly permit personal use. A saver may
   look up a price on NSE and type it into our calculator — and because we have no server,
   that number never leaves their phone. This fits the architecture exactly.
2. **Written permission.** The terms contemplate it ("except where you have been given
   express written permission"). Worth a letter to `dataservices@nse.co.ke` once the app
   has users to point at.
3. **A commercial licence.** Their Market Data Pricelist is published. A question for the
   day there is revenue, not before.

**What we will not do:** scrape it quietly and hope. The disclaimer is unambiguous, it is
printed directly beneath the very table in question, and pleading that it was technically
easy is not a defence.

## 12. Prospectus probe — coupon dates yes, day count no (2026-07-25)

Roadmap items 1 and 2 assumed both facts lived in the prospectus. Probing found that
only one does.

**52 issue-coded prospectus PDFs** found once the probe was scoped to the listing table
(its first run inspected sidebar boilerplate instead — see below). Three inspected:

| Document | Text | Tables | Day count | Interest payment dates |
|---|---|---|---|---|
| Aug 2016 — FXD 1/2016/10 | 4,056 chars | 0 | **not stated** | present |
| Jul 2016 — FXD 2/2016/5 | 5,996 chars | 2 | **not stated** | present |
| Jun 2016 — FXD 2/2016/2 | 7,962 chars | 4 | **not stated** | present |

### What this changes

**Item 1 (exact coupon dates) — plausible, with a caveat.** Every prospectus carries an
"Interest Payment Dates" section and 27–167 date strings. But one extracted line reads:

```
| Interest Payment Dates: as a last resort at 3% above the prevailing
```

That is text bleed from a two-column layout — `pdfplumber` interleaved columns and
stitched half of one sentence onto the heading of another. **Naive line-based regex on
these PDFs will produce confident nonsense.** Any parser must be table-aware
(`extract_tables`), and must reject rows that fail a sanity check rather than trusting
what it stitched together. This is exactly the failure mode that makes a wrong coupon
date look authoritative.

**Item 2 (day-count convention) — not answerable here.** None of the three states it.
On reflection that is correct design rather than an omission: a prospectus sells *one
issue*, whereas the convention governs *every* issue and belongs in the rules. So the
probe now also inspects the **CBK Auction Rules & Guidelines** — one of the very PDFs
the prospectus hunt filters out as boilerplate. Wrong document for that question,
plausibly the right one for this.

Until it is confirmed from an authoritative statement, Actual/365 remains an
**assumption**, and the calculator continues to label it as one.

### Two lessons recorded

1. **The 2016 problem, again.** The listing surfaces 2016 archives — exactly what the
   Weekly Bulletin probe hit in §8. CBK's DataTables listings appear to serve oldest
   first. The current-year listing must be located before any parser ships, or we would
   confidently parse decade-old schedules.
2. **"The first PDFs on the page" is not "the PDFs the page is about."** The probe's
   first run inspected `AuctionRulesGuidelines.pdf`, `BBP.pdf` and the Master Repurchase
   Agreement — sidebar links present on every CBK page, which is why they had turned up
   in every probe that day. The tell was that the same three files kept appearing
   regardless of which page was being probed.

### Follow-up: the rules document does not state it either (same day)

The hypothesis in §12 — that the day-count convention belongs in the rules rather than in
an individual prospectus — was reasonable and **wrong**. Probed:

```
--- CBK Auction Rules & Guidelines
    7 page(s), 13495 chars, 0 table(s)
        DAY COUNT: not found
    >>> COUPON DATES: 1 hit(s) — ['coupon payment date']
        BUSINESS DAY RULE: not found
    date-like strings in document: 0
```

It mentions coupon payment dates in passing and never defines the accrual basis. So the
convention is stated in **neither** the prospectus nor the auction rules.

A second finding, arguably more important:

```
  scanning 272 link(s) from the whole page (no table found)
  52 prospectus PDF(s) matched an issue code
```

**The prospectus listing serves no `<table>` at all.** Unlike `/press/` (§10), this page
does not ship its grid in the HTML — so the 52 matches are archive links scattered
through the page, and every one of them is from 2016. The current-year prospectuses are
not reachable by this route.

### Verdict: roadmap items 1 and 2 are BLOCKED, not ready

Neither is buildable today, and knowing that is the point of probing first:

| Item | Blocker |
|---|---|
| Exact coupon dates | Only 2016 documents reachable; listing not in served HTML; two-column text bleeds between fields |
| Day-count convention | Stated in no CBK document we can find |

**What would unblock them.** For coupon dates: locate the current-year prospectus route
(the listing is likely rendered client-side, so an inspection of its network calls in a
browser would settle it). For the day count: stop looking for a statement and test the
behaviour instead — take one CBK-published settlement amount for a known bond and date,
and check which convention reproduces it. That was always this item's "done when"
criterion; it now becomes the method rather than the confirmation.

**Meanwhile nothing changes for users.** Actual/365 stays an explicit, labelled
assumption, and coupon dates stay labelled as estimates — which is what they already
say. We have not made anything worse by failing to confirm; we have only declined to
build a parser on documents from 2016 using a convention we cannot verify.

## 13. CBK securities register via DhowCSD — the correctness win (2026-07-25)

The single most valuable dataset added to this project, and it fixes errors that were
already live.

**Source.** The **Securities** list on [DhowCSD](https://dhowcsd.centralbank.go.ke/),
CBK's own central securities depository. Crucially it sits **outside the login** — the
button appears next to "Create account", not behind it — so this is public reference
data. The export carries no account number, no name, no balance and no holding: every
row is a security the government has issued.

643 securities; 157 outstanding on the export date (59 Treasury bonds, 98 Treasury
bills); maturities from 2023 to 2056. Columns: issue number, ISIN, issuer, issue date,
maturity date, type, individual nominal value, currency.

### What it corrected

**Every one of our nine bonds had a fabricated ISIN**, and **seven had wrong dates** —
maturity off by up to **119 days** (IFB1/2022/19: we had 2041-05-27, the register says
2041-01-28).

That is not cosmetic. Maturity defines the remaining cash-flow schedule, so it moves
**yield to maturity, the coupon calendar, .ics reminders, ladder rungs and every goal
projection** built on them. 24 corrections applied by `registry.py`.

### Two things it deliberately does NOT change

**1. `tenorYears` — the trap worth naming.** The register's dates make FXD1/2022/10
span **9.97 years** (2022-05-16 → 2032-05-03). Recomputing tenor from those dates would
drop it below the ten-year threshold and move it from the **10% withholding band to the
15% band**, understating its net yield for every user. The bond is *issued* as a
ten-year bond and taxed as one; the missing days are settlement and business-day
conventions, not a shorter loan. **The issue code carries the legal tenor, so the issue
code wins.** Two tests in `financial-engine.test.ts` now fail if anyone "fixes" this.

**2. `minInvestmentKES`.** The register's "Individual Nominal Value" reads 50,000 for
most securities — matching the known CBK minimum — but **1** for a handful, including
IFB1/2018/15. A nominal of 1 almost certainly denotes the unit denomination rather than
the smallest permitted subscription, and writing it through would tell someone they can
buy that bond for one shilling. Two plausible readings of a column is not enough to
overwrite a user-facing figure, so ours stands.

### Status and what is still missing

The register publishes **no coupon rate and no yield** — those still come from
prospectuses and auction results. It also gives us the full outstanding universe of
**59 bonds against the 9 we currently ship**, which is the obvious next expansion.

The reconciliation currently runs from a committed export
(`backend/reference/dhowcsd-securities.csv`). `discover_secondary_sources.py` now probes
whether the Securities list is fetchable without a session; if it is, this becomes
automatic rather than manual.

## 14. Auction results and DhowCSD automation — both probed, both negative (2026-07-25)

### DhowCSD cannot be scraped: it is a single-page app

```
https://dhowcsd.centralbank.go.ke/            HTTP 200, 2415 bytes, 0 tables
https://dhowcsd.centralbank.go.ke/securities  HTTP 200, 2415 bytes, 0 tables
```

Two different URLs returning **byte-identical 2,415-byte shells** is the signature of a
JavaScript application that renders everything client-side. Plain `requests` sees the
shell and never the securities.

**Consequence.** The register reconciliation in §13 stays a **manual re-export** — which
is perfectly workable, since new issues appear a few times a month, not hourly.
Automating it would need either the underlying API (discoverable by watching the network
tab, or by running a headless browser on a CI runner) or a browser in the pipeline. Not
worth that complexity yet.

### Auction results: the path is undiscovered, not absent

Three guessed URLs, three 404s:

```
/securities/treasury-bonds/treasury-bonds-results/   404
/securities/treasury-bills/treasury-bills-results/   404
/auction-results/                                    404
```

But the bonds landing page returns **HTTP 200 with "coupon rate" and "weighted average"
present in its HTML — and zero tables**. The vocabulary exists with nothing to hold it,
which means the results page is real and linked; we simply invented the wrong addresses.

**Guessing URLs is how you conclude "not available" about something that is.** The probe
now follows CBK's own navigation and reports every link matching
result/auction/issue/history/rate, instead of asserting paths.

### Why this matters more than the other blocked items

Three roadmap items are downstream of auction results:

| Item | What auction results supply |
|---|---|
| Universe expansion (9 → 59 bonds) | **Coupon rates** — the register gives identity and dates but no coupon, and without a coupon there is no yield |
| Yield history (#4) | Twelve months of clearing yields, answering "is that any good?" |
| Auction capture (#5) | The weighted average accepted rate — what to actually bid |

This is the single highest-leverage dataset still missing.

## 15. CORRECTION: I was probing a stale path — auction results ARE readable (2026-07-25)

Capt. Ng'ong'a pointed out that coupon rates are publicly available via a thorough web
search of CBK's site. He was right, and §12/§14 were wrong because of how I looked.

### The mistake

Every probe this session hit **`/securities/treasury-bonds/`**. That path answers
**HTTP 200** — so I trusted it — but serves a **legacy 2016 archive**. It is why the
prospectus probe twice reported "only 2016 documents reachable" and why item 1 went down
as blocked.

The live section is **`/bills-bonds/`**, and one web search found it plus:

| What | Where |
|---|---|
| Auction results archive | `/uploads/historical_treasury_bond_results/` |
| T-bill results archive | `/uploads/91_day_historical_treasury_bill_results/` |
| **Current** prospectuses | `/uploads/treasury_bonds_prospectuses/` — sample is **January 2026** |

**A legacy path returning 200 is more dangerous than one returning 404.** The three 404s
from my invented URLs were honest signals. The 200 was what misled me, precisely because
it looked alive. Search before guessing; a live-looking page is not evidence it is the
current one.

### What the results PDFs actually contain

```
| Price per Kshs 100 at average yield   100.000   97.632
| Coupon Rate (%)                       1 1.277   1 2.873
| New Borrowing/Net Repayment           69,507.37
| B. FORTHCOMING TREASURY BOND(S) ISSUE(S) FOR THE MONTH OF DECEMBER 2021
```

**Text layer present, coupon rates and clearing prices both there.** This unblocks the
three items that were downstream of it.

**One hazard, already familiar.** `Coupon Rate (%) 1 1.277 1 2.873` is two coupons —
11.277% and 12.873% — with a space injected by the two-column layout. A naive regex
would read `1`, `1.277`, `1`, `2.873` and produce four wrong numbers with total
confidence. Any parser must reconstruct columns (`extract_tables`, or x-position
clustering on `page.chars`) and sanity-check every rate against a plausible band, exactly
as `cbr_history_parser.py` does.

### Revised status

| Item | Was | Now |
|---|---|---|
| Coupon rates for all 59 bonds | blocked | **reachable** — parse results PDFs |
| Yield history (#4) | blocked | **reachable** — the archive is the history |
| Auction capture (#5) | blocked | **reachable** |
| Exact coupon dates (#1) | "2016 only" — WRONG | re-probe against the live listing |
| Day-count convention (#2) | not stated | still not stated; test behaviour instead |
