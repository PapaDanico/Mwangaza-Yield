# Roadmap

Written 2026-07-25, after the first production release. Ordered by **user value per
unit of risk**, not by how interesting the work is.

The governing principle from the build so far: **verify the data before building the
feature.** Three separate assumptions turned out false when actually tested — CBK does
not block scrapers, the T-bill quote-to-yield gap widens with tenor rather than
narrowing, and the NSE price list cannot be read by software at all. Each would have
shipped as a confident, wrong claim.

The principle paid out again in July: CBK's MPC press table *looked* like a
JavaScript-rendered grid, and turned out to serve all 129 rows as plain HTML. Probing
rather than assuming turned a "probably needs a headless browser" into eighteen years of
rate history in an afternoon. See `DATA-SOURCES.md` §10.

---

## Now — correctness and trust

These affect whether the numbers can be relied on. Nothing else matters more.

### 1. Exact coupon dates from prospectuses
**Problem.** Coupon dates are computed by adding months to the issue date. Real CBK
coupon dates follow business-day conventions and shift for weekends and holidays. Every
"next coupon date", the cash-flow calendar and the .ics exports inherit that
approximation.
**Approach.** `cbk_parser.py` already opens prospectus PDFs. Extract the published
coupon schedule and store it per bond; fall back to the computed schedule only when a
prospectus is unavailable, and keep labelling that case as estimated.
**Done when.** A bond with a published schedule shows prospectus dates, and the UI
distinguishes exact from estimated.

### 2. Day-count convention verified
**Problem.** Accrued interest uses Actual/365 by assumption. The exact convention is
stated in the prospectus and changes every settlement figure.
**Approach.** Read it from a real prospectus; encode per bond if it varies.
**Done when.** A hand-checked accrued-interest figure matches CBK's own for the same
settlement date.

### 3. Real secondary-market prices
**Problem.** The calculator falls back to par (100) when there is no traded price. Par
is rarely the truth, and users may not notice the assumption.
**Now settled (2026-07-25).** The blocker is legal, not technical. NSE's Market Statistics
page does serve tables in plain HTML — but its terms forbid copying, storing, redistributing
*or building a product on* the data, except for personal use. See `DATA-SOURCES.md` §11.
**Options, in order.** (a) Let the USER fetch and enter a price — explicitly permitted as
personal use, and it never leaves their device; (b) request written permission, which the
terms contemplate; (c) buy the licence once there is revenue.
**Interim.** Make the par fallback explicit in the UI rather than silent, and say plainly
why we cannot fill it in for them.

---

## Next — features that compound

### 4. Yield history
The app answers "what does this pay?" but never "is that good?" — the question every
investor actually asks before bidding. Twelve months of auction prints behind a
sparkline on each bond would answer it. CBK publishes historical results; this is a
data-collection task more than a UI one.

The CBR history shipped in §12 below is the *policy* half of this answer and proves the
pattern works end to end — scrape, guard, test, narrate. Per-bond auction prints are the
*market* half, and are the natural next application of it.

### 5. Auction result capture
We show what is *offered*. We do not show what it *cleared at* — the single most useful
number for deciding what to bid next time. Feeds directly into (4).

### 6. Goal progress over time
Saved plans are a snapshot. Storing a monthly progress point would turn Goals into
something people open to watch a number move, which is what makes a tool a habit.

### 7. Sovereign context expansion — CBK Weekly Bulletin CONFIRMED usable
Probed 2026-07-25: the bulletin PDFs carry a real text layer (915 chars on page 1) and
are parseable with `pdfplumber`. This is the one genuinely new source found in the
July source review.

**Two things to settle first:**
- The probe surfaced 2016 archives. Locate the current-year listing page; the URL
  pattern is `/images/docs/weeklybulletin/<YYYY>/<Mon>/Weekly_Bulletin_-_<Month>_<D>_<YYYY>.pdf`.
- It carries **turnover, not prices**. Enriches the "Can the borrower pay?" panel with
  market activity and liquidity; does **not** solve (3).

CMA was probed at the same time and yielded nothing — `/statistics/` and
`/market-statistics/` both 404, homepage links no matching PDFs.

---

## Done since this roadmap was written

### 12. CBR rate-cycle history — shipped 2026-07-25
119 MPC decisions from December 2008, scraped from CBK's own press table, with each
point linking back to the original press release. Turns the static "CBR 8.75%" into the
path that explains it: ten cuts from 13.00%, now held twice.

Deliberately anchored to the **current cycle**, not the 2011 record high — comparing
today against 18.00% would present a 9.25-point easing that never happened as one move.
This is the kind of detail that makes a chart either informative or quietly misleading.

---

## Later — reach

### 8. Custom domain
`mwangazayield.co.ke` before wide sharing. Links posted now point at the Netlify
subdomain forever.

### 9. Swahili
The audience is Kenyan; the app is English-only. Not a translation of jargon — a
rewrite of the explanations in the language people think about money in.

### 10. Accessibility audit
Contrast has been checked at the token level. Screen-reader flow, focus order and
keyboard traps have not been.

### 11. Corporate bonds
Different credit risk, different tax treatment, and genuinely riskier. Only worth doing
with the same rigour applied to government paper — a half-correct corporate yield is
worse than none.

---

## Explicitly not doing

- **OCR of the NSE scanned price list.** OCR confuses digits; a misread bond price is a
  wrong number shown with full confidence. See `DATA-SOURCES.md`.
- **Broker research or news content ingestion.** Copyrighted. Link, cite, never
  republish.
- **Unofficial or scraping-restricted endpoints** (Investing.com, yfinance). A money
  tool should not rest on an interface that can vanish or that we are not permitted to
  use.
- **Any source needing an API key**, until there is a server to hold one. Today no key
  means no server, no server means no account, and no account means portfolios never
  leave the device.

---

## Health checks before any release

1. Dispatch `validate-sources` — confirms every source is still reachable **and** still
   contains the marker its parser depends on.
2. Dispatch with `test_alert: true` — confirms the alarm still fires.
3. `npm test` and `npm run build`.
4. Open the production site on a phone, install to home screen, enable airplane mode,
   confirm the calculator still works.
