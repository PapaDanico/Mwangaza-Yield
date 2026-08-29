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
> World Bank — plus one clearly-labelled IMF forecast file added 2026-08-29 (see §22).**
> `secondary.json` ships empty and stays that way.

### The CMA route was investigated and is closed — 2026-08-07

The Capital Markets Authority is the regulator, not the Exchange, so nothing in the rule
above reached it automatically, and its Quarterly Statistical Bulletin does carry
secondary bond market figures — Q2 2026 was published and reachable, with a
"Quarterly Bonds Turnover" table. It was a fair question and it was asked properly.

`probe_cma.py` answered it on a CI runner. Three consecutive bulletins — Q2 2026,
Q1 2026 and Q4 2025 — were downloaded and their text searched for provenance. **All
three credit the Nairobi Securities Exchange**, matching on `nairobi securities
exchange`, `nse` and `source:`. The Q4 2025 bulletin additionally carries per-security
identifiers (`isin`, `fxd1`, `ifb1`, `sdb1`).

So the bond figures in the CMA bulletin are the Exchange's data reprinted under a
different masthead, and a regulator republishing it does not change whose it is. The
rule above exists to avoid redistributing that data, and reading it from CMA would be
the same redistribution one hop removed. **CMA bond market data is not used.**

Two things this does *not* say. It is not a claim that CMA forbids reuse — CMA's own
terms were not the deciding factor and were not read; the Exchange attribution settled
it first. And it does not close the door on genuinely CMA-original aggregates
(licensing statistics, market conduct, investor numbers), which no Exchange feed
produces. If one of those is ever wanted, it is a fresh question, and the test is the
same: open the document, find the table's own source note, and write the answer down
here before a parser exists.

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
- **Discount convention (verified against CBK's published prices):**
  `Price per 100 = 100 / (1 + rate × days / 365)`, and the effective annual yield
  `= (100 / Price) ^ (365 / days) − 1`. CBK's quote is a **true discount** — a simple annual
  yield on the price paid — not a bank discount on face value. The quoted rate is therefore
  below the true gross yield, but only by the value of rolling over: about 29bps at 91 days,
  and under 1bp at 364, where there is nothing left to reinvest.

  This entry previously read `Price = Face − Discount` and was also marked "verified". It was
  not: every CBK results release prints `Price per Kshs 100 at average interest rate`, and on
  the 03/08/2026 auction the true-discount formula reproduces all three tenors to four decimals
  (97.8559 / 95.7259 / 91.7497) while bank discount misses by up to Ksh 0.74. The old formula
  understated the price and so overstated the return — 84bps too high on the 364-day bill.
  Cross-check any convention against a figure the source itself publishes, not against its prose.
- **WHT 15%** on bill interest, with no exemption equivalent to infrastructure bonds.
- ⚠️ The National Treasury announced from 2025 that the **364-day bill would be phased out** to
  shorten the debt profile. It is still being auctioned: the 30 July 2026 auction (dated
  03/08/2026) offered Ksh 10bn and took Ksh 4.78bn, and the tenor was on offer again for the
  6 August close. Note that it is now the weakest of the three — a 47.93% performance rate
  against 180.04% at 91 days — so the tenor is under notice and thinly bid, but not gone.
  Re-check each cycle rather than assuming either its survival or its removal.

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
| IMF | **Integrated — WEO outlook only** (2026-08-29, §22) | IMF Data terms permit redistribution with attribution; the verdict lives in `licences.ts`. Measured outturns stay with the four sources above |
| Broker research, press | Linked only | Copyrighted; cited for context, never republished |
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

## 7. Who actually serves Kenya's debt-to-GDP (2026-08-05)

`backend/scrapers/probe_debt_sources.py`, via `workflow_dispatch` → `probe-debt-sources`.
Run it again rather than trusting this table if the question comes back.

The question arose because `/sources` states that the World Bank returns no observation for
Kenya against `GC.DOD.TOTL.GD.ZS`. That is a claim about **one API**, and it is not the same
claim as "nobody publishes this" — the ratio is quoted constantly in Kenyan coverage.

| Candidate | Result | Reading |
|---|---|---|
| WB `GC.DOD.TOTL.GD.ZS` | 200, **66 rows, 0 with a value** | The claim on `/sources` is correct. Verified, not assumed. |
| WB `GC.DOD.TOTL.CN` | 200, 66 rows, 0 with a value | Same debt as a level. Also empty. Not a workaround. |
| WB `DT.DOD.DECT.CD` | 200, **55 values**, 2024 = US$42.886bn | External debt **stock**, not a ratio. Real data, already redistributable. |
| WB `DT.DOD.DPPG.GD.ZS` | 200 with `Invalid value` | The code does not exist. A guess, and it was wrong. |
| WB `DT.DOD.PVLX.GN.ZS` | 200, **1 value**, 2024 = 24.70% | Present value of external debt / GNI. One observation is a data point, not a series. |
| IMF DataMapper `GGXWDG_NGDP/KEN` | 200, 1998–2031 (34 points) | The series everyone quotes. **Runs to 2031 — most of the tail is forecast.** |
| FRED `KENGGXWDGG01GDPPT` | 200, keyless CSV, 2021–2026 | Redistributes the IMF series. 2025 = 68.02, 2024 = 67.34, 2023 = 73.41. |

**Not wired in, and the reasons are specific rather than squeamish.**

1. **The two copies of the same IMF series disagree.** FRED gives 2026 as **70.08**; the IMF's
   own DataMapper gives **71.6**. Same series, different vintage, 1.5 points apart. Publishing
   either without saying which vintage it is would present a version as the value.
2. **The projections are not flagged in the payload.** The IMF ships outturns and forecasts in
   one undifferentiated map of year → number. A forecast rendered in a panel of measurements,
   beside World Bank outturns, is the dishonest kind of accurate. Filtering to years before the
   current one is a fix, but it is our inference about their data, not their labelling.
3. **The licence.** This one was first recorded as "unverified because the dev sandbox cannot
   reach the terms page" — which is a fact about our proxy, not about the IMF, and was the wrong
   thing to leave in a record of why we declined. The probe now reads both terms pages on the
   runner. See below: it changed the answer on FRED and left it genuinely open on the IMF.

What is *now* known and was not before: the gap is narrower than the page implied. The World
Bank does serve Kenya's **external debt stock** in dollars, machine-readably, under a licence we
already rely on. What it declines is the **ratio to GDP** specifically.

### 7.1 What the terms say (2026-08-05, read on the runner)

**FRED does not launder the question — it answers it, and the answer is no.** Its own terms,
quoted from the page:

> As long as you don't engage in a prohibited/restricted use … you are free to use FRED for your
> own **non-commercial, educational, and personal** uses.

> Series with a **copyright notice are owned by third parties and have special restrictions**.
> Before using data with a copyright notice for anything other than your own personal use, you
> must **contact the data owner to obtain permission**.

And among the prohibited uses:

> **Redistribute any third party's proprietary content** … for commercial use without first
> obtaining **express written permission from the data provider**.

`KENGGXWDGG01GDPPT` is an IMF series carried by FRED — third-party content by FRED's own
definition. So FRED grants us nothing here, and the permission it points at is the IMF's to give.
That is a settled negative rather than an open question, which is a better place to be than
before we asked.

**The IMF's own terms remain unread, and the probe says so rather than guessing.**
`imf.org/external/terms.htm` returns 200 with an effectively empty body — no extractable prose,
so the page is presumably assembled by script. The probe distinguishes this from "the terms are
here and mention nothing", because collapsing the two is how *"we checked"* comes to mean *"we
failed to check"*. **Reading it needs a human with a browser.**

**Net effect on the decision: unchanged, but for better reasons.** Two data grounds still stand
on their own (disagreeing vintages, unflagged projections). The licence ground is now one
verified prohibition and one honest unknown, instead of a sandbox error.

**Amended 2026-08-29:** the licence ground closed eleven days after this was written —
`licences.ts` carries the IMF at `permitted`, checked 2026-08-16, with the operative
sentence quoted from `imf.org/en/about/copyright-and-terms`. The two data grounds are
resolved by the shape of the shipped file. See §22.

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

## 16. The T-bill history is reachable without PDFs — and three other CSVs turned up (2026-08-18)

`probe_tbill_rates.py` ran for the first time on 2026-08-17 and its findings are
committed at `backend/scrapers/tbill-probe-report.txt`, so nothing below has to
be taken on trust.

### The answer to the T-bill question

| Page | Bytes | CSV link? | Tables in served HTML |
|---|---|---|---|
| Treasury Bills Average Rates | 68,603 | no | **none reported** |
| T-bill results (LIVE listing) | 1,942,947 | no | **8, with all three tenors** |
| Interest Rates (statistics) | 64,395 | **2** | — |
| Central Bank Rates | 182,676 | no | 1, with all three tenors |
| Statistics index | 47,709 | no | — |

**No CSV export exists for the Treasury bill series.** The hypothesis that
started this probe — that `/uploads/interest_rates/…_Central Bank Rates.csv`
implied a matching T-bill export — is **refuted**. Two CSVs live under that
slug and neither is the bill series.

**But the PDFs are not the only route either.** The live results listing serves
**1.9 MB with eight tables and all three tenors in the HTML**, so
`pandas.read_html` reaches it without a browser and without parsing a single
PDF. That is the route for roadmap item #28.

The Average Rates page — the one that *sounds* like the right page — reported
no table. It is most likely assembled client-side. **The page with the obvious
name is not the page with the data**, which is the same lesson as §15 in a
different costume.

### What else the probe found, unlooked-for

These were included because the run was happening anyway and each GET was free:

- **`/uploads/fx_rates/historical_data.csv`** — link text *"Download All
  Historical Rates"*. Every trading day CBK has published, in one file. The app
  currently shows FX from a World Bank figure with a 2024 vintage.
- **`/uploads/interest_rates/537280676_Commercial banks Weighted Average Rates.csv`**
  — the lending-rate comparator: what the same shilling costs to borrow, beside
  what it earns lent to the government.
- **`/wp-content/uploads/2026/05/April2026.xlsx`** — remittances by source.
  Note the dated path: this URL changes every month, so a scraper must find the
  link from the page rather than hard-code it.
- Thirteen per-year FX CSVs from 2003–2015, superseded by the "all historical"
  file above.
- **Interbank rates: no CSV, no table.** The one candidate that did not pan out.

### What is still not settled

The **licence**. The probe reports each page's terms links precisely because
this is the half that is easy to skip. No site-wide CBK terms of use has been
found; only the Quarterly Economic Review carries an explicit reproduction
grant, which is what `src/lib/licences.ts` quotes. Redistributing a CBK *table*
rests on that same notice, and that inference should be checked before any of
the above is published rather than after.

---

## 17. CBK Market Perceptions Survey — INGESTED, after a verdict that changed (2026-08-21)

The July 2026 survey was supplied directly as a PDF, because
`centralbank.go.ke` is denied by this environment's egress policy and no
session can fetch it.

**What it is.** CBK runs it before every MPC meeting: 400 private-sector firms
— 37 commercial banks, 14 microfinance banks, the rest non-bank across eight
towns, in sectors worth about 78% of GDP. July's fieldwork ran in the first
three weeks of the month; the report is dated 18 August. It reports what
respondents *expect* of inflation, growth, credit and lending rates — not what
has been measured.

### The verdict here was first "do not ingest", and it was wrong

That is recorded rather than quietly overwritten, because the reasoning is the
useful part. Three objections were raised. Two dissolved on inspection and one
survives in a weaker form.

**Objection 1 — the numbers are inference, not statement. RESOLVED.** Text
extraction yields chart values and series names as separate runs, so mapping
one to the other looked like reading order rather than something the document
asserts. That is a real hazard and it is exactly the attribution defect
`licences.ts` exists to prevent — but it is solvable rather than fatal. The
pages were rasterised with pdfjs and read visually, and every figure below was
taken off a rendered chart with its legend in view. Verified, not inferred.

**Objection 2 — it would be a fourth hand-fed surface, and we already fail to
feed three. RESOLVED, by work done an hour earlier.** `tbills.json` sat three
auctions stale; `real-history.ts` is imported nowhere; `macro_context_parser.py`
runs from no workflow. That was a strong objection while nothing detected rot.
It is not any more: `readerNotice` now warns when a figure passes its own
publisher's cadence, and `expectations.json` is registered in
`healthcheck.py` with a 75-day budget. When the next survey is late, the site
says so by name, without anyone remembering to look.

**Objection 3 — the licence rests on an inference. STANDS, but it is not new.**
Section 16 records it: no site-wide CBK terms have been found, only the
Quarterly Economic Review carries an explicit reproduction grant, and
`licences.ts` quotes that one. Extending it to a Market Perceptions Survey is
one hop further out. The survey PDF itself carries no copyright notice, no
reproduction grant and no rights statement — checked, and its metadata is bare
InDesign output. But this is the same inference already load-bearing for the
CBR, the CPI, the FX rate and every T-bill figure on the site. Ingesting the
survey does not create a new exposure; it relies on one that is already
carrying everything else. If that inference is ever found to be wrong, the
problem is not this dataset.

### What was ingested

`public/data/expectations.json`, an ARRAY on purpose so the licence sweep in
`tests/unit/licences.test.ts` can see it — an object would have been skipped by
that test and escaped the check entirely. Inflation expectations, percent:

| Horizon | Banks | Non-banks |
|---|---|---|
| Next 3 months | 6.70 | 6.13 |
| Next 1 year | 6.24 | 5.05 |
| Next 2 years | 5.90 | 4.65 |
| Next 5 years | 5.42 | 4.29 |

Both panels are carried separately and never blended into a headline. They
disagree by more than a point at one year, and that disagreement — the people
lending money and the people borrowing it holding different views of inflation
— is itself the information.

### The boundary that must hold

These are opinions. `macroRegime` reaches a verdict about whether conditions
favour bond investors, and nothing here feeds it. A test asserts that
directly, because an opinion that moves a recommendation is an opinion wearing
a measurement's clothes, and this repository has shipped the milder version of
that mistake more than once.

**One corroboration worth keeping.** The survey's own reference for actual
inflation reads 6.5 at July 2026, against the 6.49 carried in `macro.json`.
Independent confirmation from the publisher that our headline CPI is right.

---

## 18. Annual GDP table — analysed, NOT ingested, blocked on provenance (2026-08-21)

Supplied as a CSV and a matching PDF: 26 rows, 2000–2025, with nominal GDP,
real GDP and annual growth.

**Provenance was the first objection and it has largely dissolved.** Neither
file names a publisher; the PDF is bare `pdfmake` output dated 2026-07-21 with
no branding or rights statement. But a second export supplied afterwards — the
Statistical Bulletin index, section 19 below — carries the *identical*
generator signature and was created eleven minutes later in the same browsing
session, and the Statistical Bulletin is unambiguously a CBK publication
series. Together with section 16's finding that CBK's tables have exactly this
CSV export, that is five independent strands pointing at CBK.

**SETTLED the same day.** The source URL was supplied:
`https://www.centralbank.go.ke/releases/statistical-bulletin/`. Both exports
are CBK's, and the inference above is now a fact. The licence position for
these tables is CBK's grant, the same one already carrying the CBR, the CPI
and every T-bill figure.

**The reason it is not ingested is simpler than the licence: it unlocks
nothing.** The obvious use would be computing debt/GDP ourselves and closing
the gap `sovereign-gaps.ts` documents — but that needs a government debt STOCK,
and we do not have one. `context.json` carries the World Bank's *external* debt
series, which is a different quantity. GDP is the denominator; the numerator is
the part nobody can obtain. Adding twenty-five years of GDP levels would buy a
history chart on a site about bonds, at the cost of a fourth hand-fed dataset.

That is the honest verdict, and it is worth stating in that order — the licence
objection was the easier one to reach for, and it was not the binding one.

### The series has a rebasing break at 2008/09, and it is not subtle

Found by reconciling the real-GDP levels against the growth column year by
year. Every year agrees within 0.1pp except one:

```
2008   real 1,357,262   growth  1.50   implied from levels    1.53
2009   real 5,361,462   growth  2.70   implied from levels  295.02   <==
2010   real 5,793,514   growth  8.10   implied from levels    8.06
```

Real GDP does not quadruple in a year. The pre-2009 figures are on an older
base and the later ones are rebased — 2016 is the base year in this table,
where nominal and real are identical to the shilling. Anyone computing growth
from these levels across that boundary gets +295%, and it would render as
confidently as any other number.

So if this is ever ingested, the levels must not be treated as one continuous
series. The growth column is per-vintage and reconciles; the levels do not.

### It corroborates the GDP figure already shipped

Implied real growth for 2025 from the levels is **4.63%** — exactly the figure
in `macro.json`, which is attributed to the World Bank. This table's own growth
column rounds it to 4.60. Two independent publishers agreeing to two decimal
places is worth more than either alone.

---

## 19. CBK Statistical Bulletin — an index, and the best lead on the debt gap (2026-08-21)

Supplied as a CSV and PDF pair. Neither is data: both are a **listing of
editions**, 45 of them, June 2003 through December 2025, published twice a year
in June and December. Same `pdfmake` signature as the Annual GDP export above,
created eleven minutes after it.

**Why an index is worth recording anyway.** `sovereign-gaps.ts` exists because
the World Bank returns no observation for Kenya's government debt / GDP, and
the sovereign panel tells readers so rather than inventing a number. Two probes
in `backend/scrapers/` — `probe_treasury_debt.py` and `probe_debt_sources.py` —
are already hunting for a route to it.

The Statistical Bulletin is the strongest candidate yet seen. It is CBK's
standing statistical series, it is exactly where public debt tables live in a
central bank's publication set, and this listing tells us three things the
probes did not know:

- **Cadence: twice a year**, June and December. So a debt figure from it would
  carry a ~180-day budget, not a daily or monthly one, and would not read as
  stale between editions.
- **Archive depth: back to June 2003**, with a "December 2009 Revised" edition
  in the list — a reminder that these get restated, so any ingestion must key
  on the edition rather than assume a figure is final.
- **Latest edition: December 2025.** June 2026 is not yet listed, which is
  itself the freshness signal for anything drawn from it.

**Not ingested, because an index is not data.** The next step, if the debt gap
is ever worth closing, is to open the December 2025 edition and find out
whether it carries a public debt table in a form a parser can reach — and to
capture the URL while doing so, which would also settle section 18.

---

## 20. The Treasury has migrated hosts, and the debt bulletin URL scheme changed (2026-08-21)

Found by web search, because `treasury.go.ke` is as unreachable from a session
as CBK is. `probe_treasury_debt.py` cannot run here either, so this is
discovery rather than verification, and it is recorded as such.

**What has not changed.** `https://www.treasury.go.ke/monthly-bulletins` is
still the index the probe already lists, and the Treasury still publishes a
Public Debt Bulletin monthly. Nothing in the probe's premise is stale.

**What has.** Two URL schemes are now live, which is consistent with a
WordPress-to-Drupal migration:

```
old   www.treasury.go.ke/wp-content/uploads/2024/02/August-2023-Monthly-Bulletin.pdf
new   newsite.treasury.go.ke/sites/default/files/Debt Monthly Bulletins/December 2025 Monthly Bulletin.pdf
```

Note the host changes as well as the path, and the new scheme uses spaces
where the old used hyphens. The probe discovers links rather than constructing
them — which is exactly the design that survives this — but its scoring runs
against hrefs, and a `newsite.` absolute URL will not be caught by the
`"https://www.treasury.go.ke" + href` join at line 168. Worth checking when
the probe next runs somewhere with network access.

**Cadence reality check.** The most recent bulletins surfaced are March 2026
and February 2026. As of August 2026 that puts the Treasury's own debt series
roughly five months behind, which is still an order of magnitude better than
the World Bank vintages the sovereign panel currently shows — but it is not
"monthly and current", and a budget set from the publication cadence rather
than the observed lag would fire constantly.

### What was deliberately NOT taken

Two search results carry a December 2025 debt figure. Both are
**`refused`** in `licences.ts` by name — CEIC and Trading Economics — and the
licence tests assert that refusal. Neither is usable at any level of
convenience.

Nor is a search summary of the Treasury PDF a substitute for the PDF. This
probe's own standard is that a figure must sit ADJACENT to its label in a
document carrying its own reporting month, and a summary satisfies none of
that. The arithmetic is nonetheless a useful sanity check for whoever does
read it: a debt stock near KES 12,300bn against the 2025 nominal GDP of
17,577,557 million gives roughly 70%, which matches the 70.08 the probe's own
docstring records FRED serving and rejecting on licence grounds. Two
independent estimates agreeing at 70% means a parser that returns 45 or 95 has
a bug, not a discovery.

---

## 21. The August 2026 switch prospectus, and the yield reconciliation it triggered (2026-08-21)

CBK's prospectus for the switch out of **FXD1/2012/015** and t-bills
2685/091, 2646/182 and 2574/364 into **FXD4/2019/010**. Supplied as a
document; the host is blocked from a session, so nothing was fetched.

### What it confirmed

Every term already in `auctions.json` under `auc-2026-08-switch` checked out
against the prospectus: KES 15bn, sale 30 Jul – 24 Aug, auction 24 Aug,
settlement 26 Aug, destination coupon 12.28%. Both securities were already in
`bonds.json` with the right ISIN, coupon and maturity. The document added a
maturity date to the auction record and otherwise corrected nothing, which is
the outcome worth recording — the register reconciliation is holding.

### What was deliberately NOT taken

The prospectus quotes a **prevailing market yield of 9.0935%** for
FXD1/2012/015. It is five years fresher than anything else held for that bond
and it was written into `ytmGross` before being taken back out.

It is not a market observation. It is the yield CBK is USING TO PRICE a switch
settling 26 August, and the prospectus's own accrued interest of KES 3.3736
per 100 confirms the basis: that is roughly 101 days from the May coupon, so
the pricing is struck at settlement, in the future. A forward pricing input is
not a mark. `bonds.json` holds marks.

It was caught by an assertion that no yield may be dated after today, written
minutes earlier in `tests/unit/bond-yield-placeholders.test.ts`. The bond now
carries its last **observed** clearing yield, 11.474% from 2021-07-19. The
24 August result is the thing to ingest, once it exists.

### The gap it exposed

Checking that one bond surfaced a much larger one. Twenty of 58 bonds carried
a yield that could not be aged:

- **16 had `ytmAsOf: null`.** Two of those — FXD1/2012/015 and FXD1/2010/025 —
  had `ytmGross` set literally equal to `couponRate`, a placeholder reading to
  every consumer as a market yield.
- **5 more were dated years behind a result already in the repository.**
  IFB1/2019/016 sat on a 2019-10-28 mark while a 2026-08-17 one was in
  `auction-results.json` the whole time.

Nothing was missing. `bonds.json` and `auction-results.json` had simply never
been reconciled. `scripts/date-bond-yields.mjs` does that now — reading two
local files, which is why it runs from a session at all — and closed all 20.
That the old values were mostly ROUNDED versions of the auction results
(13.9 against 13.9234, 14.4432 exactly) is what established the match was real
rather than coincidental.

An undated yield is worse than a stale one: `YieldCurveChart` refuses to
describe the curve unless every point is dated and under a year old, so those
nulls were suppressing the chart's explanation for a reason no reader could
see. The chart was being cautious about ages it had never been given.

### Still open, and not fixable from a session

- **13 rows in `auction-results.json` have no `auctionDate`.** Unlike the bond
  yields, these are not recoverable: their `sourceUrl` filenames carry no date
  either (`Tap sale advert.pdf`, `FXD1_2010_25.pdf`). Reading them needs the
  PDFs, and the host is blocked. They are excluded from the reconciliation.
- **`secondary.json` is an empty array** — no secondary-market marks at all.
- **`auc-2026-06-reopen` has no `maturityDate`**, correctly: it covers two
  securities, so a single maturity would be a false precision rather than a
  gap.

---

## 22. IMF World Economic Outlook — INTEGRATED as a labelled forecast layer (2026-08-29)

Section 7 investigated the IMF's debt-to-GDP series and declined it on three
grounds: two copies of the same series disagreed by vintage, the payload does
not flag which years are forecasts, and the IMF's terms had not been read.
All three are now resolved, and the resolution is recorded where the project
keeps such things rather than in prose alone.

**The licence ground closed eleven days after §7.1 recorded it as open.**
`src/lib/licences.ts` carries the IMF at verdict `permitted`, checked
2026-08-16, quoting the operative sentence from
`imf.org/en/about/copyright-and-terms`:

> Users may download, extract, copy, create derivative works, publish,
> distribute and sell Data obtained from IMF Sites, subject to the following
> conditions: When Data is distributed or reproduced, it must appear
> accurately and attributed to the IMF as the source.

So the registry had settled the question while this document still called it
unread — the drift licences.ts exists to prevent, caught here in the
documentation rather than in the data. (The terms page was not reachable from
the session that wrote this section, so the quoted terms are the registry's
2026-08-16 reading rather than a fresh one; the registry is the authority, and
its `checkedOn` date is the freshness signal.)

**The two data grounds are resolved by the shape of what ships.**
`public/data/imf-outlook.json` names its vintage on every record
(`vintageDate: 2026-04-30`, the April 2026 WEO, retrieved 2026-08-29 via the
IMF data API), so a figure from it cannot present a version as the value —
the FRED divergence that started §7 (70.08 vs 71.6 for 2026 debt/GDP) is now
explainable to a reader rather than hidden by a bare number. And every
observation carries an explicit `status` — `outturn`, `estimate` or
`projection` — instead of relying on a year threshold. The mapping (2025
estimated, 2026 onward projected) is OUR reading of the vintage and each
record's `statusNote` says so, which is the honest form of §7's objection
that filtering by year would be our inference about their data, not their
labelling.

**What ships.** Seven WEO series for Kenya, 2020–2030: real GDP growth,
CPI inflation (annual average), general government gross debt/GDP, fiscal
balance/GDP, current account/GDP, nominal GDP and GDP per capita. WEO subject
codes travel in each record. The file is an array precisely so the licence
sweep in `tests/unit/licences.test.ts` sees every record's `source` — the
same reason `expectations.json` is one (§17). Full tables, the IFS monthly
readings, and the cross-checks against `macro.json` live in
`docs/IMF-KENYA-OUTLOOK.md`.

**What does not change.**

- **The feed contract.** `rates.json` still carries no forecasts; the outlook
  file never feeds it, and `public/data/RATES-FEED.md` now says where the
  forecast layer lives at the "No forecasts" line.
- **The measured panels.** CBR, CPI and FX stay with CBK; GDP stays with the
  World Bank. The outlook answers what IMF staff EXPECT, never what IS. The
  2025 growth figures differ (World Bank 4.63, WEO estimate 4.88) and both
  stay, each with its publisher attached — the companion doc records the
  comparison rather than resolving it by fiat.
- **KNBS stays refused as a direct source.** Nothing here routes around that.
- **`macroRegime` and every measured verdict** see nothing from this file.

**Freshness and the hand-fed surface.** Refresh is manual until a scraper
exists, so the failure mode §17 worried about — a hand-fed surface nobody
notices aging — is covered the way that section fixed it: `healthcheck.py`
budgets the file at 240 days on `vintageDate` (one April-to-October WEO cycle
plus publication lag), and it appears in `freshness.json` on the next
`--publish` run like every other dataset.

**Refresh procedure** (until a scraper exists): pull the seven subjects for
KEN via the IMF data API, rewrite the observations, update `vintageDate` to
the new edition, re-derive the outturn/estimate/projection mapping for the
new vintage rather than carrying it forward, and sanity-check the last
outturn year against the CBK/World Bank figures already shipped — a forecast
file whose history disagrees with the measured panels has a bug, not a
discovery.
