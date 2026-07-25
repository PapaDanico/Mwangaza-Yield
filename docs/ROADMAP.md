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
**BLOCKED (probed 2026-07-25).** Prospectuses do carry "Interest Payment Dates" and are
machine-readable — but only 2016 documents are reachable, the listing serves no table in
its HTML, and the two-column layout bleeds text between fields. See `DATA-SOURCES.md` §12.
**To unblock.** Find the current-year prospectus route; the listing is likely rendered
client-side, so inspecting its network calls in a browser would settle it.
**Done when.** A bond with a published schedule shows prospectus dates, and the UI
distinguishes exact from estimated.

### 2. Day-count convention verified
**Problem.** Accrued interest uses Actual/365 by assumption. The exact convention is
stated in the prospectus and changes every settlement figure.
**BLOCKED (probed 2026-07-25).** Stated in neither the prospectus nor the CBK Auction
Rules & Guidelines. There may be no published statement to find.
**To unblock.** Stop hunting for a statement and test the behaviour: take one
CBK-published settlement amount for a known bond and date, and see which convention
reproduces it. The verification criterion becomes the method.
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

### 4 & 5. Yield history and auction result capture — shipped 2026-07-25
These were written as separate items and turned out to be one thing: once the parser
kept every result it had read instead of replacing them, the archive *was* the history.

The app could always say what a bond pays. It could never say whether that was any
good — the question every investor asks immediately afterwards, and without an answer
the first number is hard to act on. The calculator now shows every auction of the
selected bond, the rate buyers actually received each time, and a plain reading of
where the latest sits in that bond's own range. No benchmark to learn first.

**Two things it deliberately refuses to do.** It draws nothing from a single auction —
one print is a point, not a path, and a trend line through one dot invites the reader to
see direction that was never measured. And it publishes no subscription ratio: CBK
reports the amount offered per *auction* but bids received per *bond*, and one auction
routinely covers three bonds, so dividing them would produce a confident meaningless
number.

The first incremental dispatch read 120 previously-unseen PDFs and reached **169 auction
records across 57 bonds**, 159 carrying a coupon, with 148 files still queued.

**It also surfaced a real defect in the archive's tail.** Roughly one file in ten from
2020–2023 parses zero or partial — `filename names 2 issue(s), parsed 0` — because CBK's
table layout differs in those years. The parser says so loudly rather than returning a
tidy partial result, which is the behaviour we want, but the coverage is genuinely lost
until the older layout is handled. That is the next piece of work on this item.

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

## Done: the universe expansion — 2026-07-25

`expand_universe.py` joins the securities register (which bonds exist, with exact
identity and dates) to auction results (coupon and clearing yield). Neither source is
sufficient alone: the register publishes no coupon, and the results do not enumerate the
universe.

**Its governing rule: a bond without a coupon rate is not added.** No coupon means no
cash-flow schedule — so no yield, no accrued interest, no settlement cost, which is every
number the app exists to produce. Listing such a bond would put an uncalculable row in
front of someone, or invite a placeholder that looks real. The goal is coverage of bonds
we can honestly price, not coverage.

First run: **9 → 15 bonds**, with 44 outstanding bonds deliberately skipped and named in
the log. Coverage is limited by how far back we read auction PDFs, not by the method —
`MAX_PDFS` was raised from 12 to 80 (of 280 linked), which should price most of the 59.

**The strongest validation of the whole pipeline:** all seven coupons that overlap our
hand-curated figures matched exactly, including FXD1/2019/20 at 12.873% — the precise
value predicted when decoding `1 2.873` from the split PDF text.

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

---

## Done: accessibility audit (roadmap item 10) — 2026-07-25

Audited all eight interactive pages for the things that actually stop someone using a
screen reader: unlabelled controls, missing alt text, controls with no accessible name,
skipped heading levels, duplicate ids, missing `lang`.

**One systemic defect, everywhere.** Every form control in the app — 11 of them across
the calculator, goals, ladder, T-bills and portfolio — had **no programmatic label**.
The visible text sat in a `<label>` with no `htmlFor` and no wrapping, so a screen
reader announced *"edit text, blank"* instead of *"Capital you have now"*. On a page
where someone is entering how much of their savings to commit, that is not a minor
finding.

Fixed two ways, chosen per case rather than uniformly:
- **Goals** wraps its control inside the label (`Field`), so one change fixed nine
  inputs without touching a single call site.
- **Calculator, T-bills and ladder** use explicit `id`/`htmlFor`, because several of
  those labels are flex rows carrying a live value on the right, and wrapping would
  have broken the layout.
- **The portfolio file input** is visually hidden and driven by a button, so it has no
  visible label to associate and takes an `aria-label` instead.

Verified with Playwright's `getByLabel`, which resolves controls by the same accessible
name a screen reader computes — all 11 now resolve. Tab order is sequential and focus
outlines are present.

Everything else came back clean: no missing alt text, no unnamed buttons or links, no
heading-level jumps, no duplicate ids, `lang` present.

**Not yet done:** contrast was verified at the token level during the rebrand but not
re-checked per rendered component, and no test with an actual screen reader (NVDA,
VoiceOver, TalkBack) has been run. Automated checks find missing labels; they do not
tell you whether the page makes sense when read aloud.
