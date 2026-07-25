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
**NOT ACTUALLY BLOCKED — the probe was reading the wrong documents (found 2026-07-25).**
`discover_prospectus.py` selected PDFs whose NAME contains an issue code. Results files
are named for their issues too, so all 506 files it inspected were auction RESULTS —
documents that report what an auction cleared at and have no reason to state a coupon
schedule. It reported "COUPON DATES: not found" and this item was marked blocked on that.

Same shape as the `/securities/` path that answered 200 while serving a 2016 archive: a
confident answer to a question never asked. The probe now selects on the upload PATH, and
says plainly when a listing carries no prospectus-path PDFs rather than settling for
whatever else is there.
**Next.** Read the corrected probe's output: it reports how many issue-coded PDFs sit on
a prospectus path versus the results path, and lists the upload segments actually
present. That names the route instead of inferring it.
**Done when.** A bond with a published schedule shows prospectus dates, and the UI
distinguishes exact from estimated.

### 2. Day-count convention verified
**Problem.** Accrued interest uses Actual/365 by assumption. The exact convention is
stated in the prospectus and changes every settlement figure.
**Evidence retracted 2026-07-25.** The "not stated in the prospectus" half of this rests
on the same broken probe — no prospectus was ever read. Only the CBK Auction Rules &
Guidelines finding survives, and that document genuinely does not state a day count.
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

**It also surfaced a real defect** — `filename names 2 issue(s), parsed 0`. The parser
said so loudly rather than returning a tidy partial result, which is the behaviour we
want, but the coverage was genuinely lost. Diagnosed and fixed 2026-07-25; see below.

### The "2020-2023 layout" defect — diagnosed and fixed 2026-07-25
Worth recording in full, because almost everything I believed about it was wrong and a
probe is the only reason none of it shipped.

**The name was wrong.** These were never 2020-2023 files. The probe found August, July,
June, May, February and January 2025 files parsing to zero. The date range came from the
first sample, not from the archive.

**The first three hypotheses were wrong.** Not a scan (every failing file carries a real
text layer). Not an unmatched code spelling (they read exactly as expected). And not a
missing header, which was my leading guess — `find_header` returned both codes with two
clean column centres on every failing file. I had already written that fix, with passing
tests, before the probe killed it. It was reverted rather than shipped.

**The obvious remedy was wrong too.** The label boundary is a positional guess,
`min(centres) - 40`. Deriving it from the header's own left edge instead lands at or
*below* the same value on these files — equally permissive. Arithmetic, checked before
shipping.

**Two real faults, found only by printing what the parser actually produced:**

1. *Label contamination.* `cell_value` joins fragments without a separator, because that
   is the only way to reassemble CBK's split digits. A label word crossing the boundary
   joins just as silently, so a cell read `(%)13.9128`, failed the numeric test, and was
   dropped — every field. Fixed by requiring a fragment to look like part of a number.
2. *The header taken from the prose title.* These PDFs open with a title naming every
   bond, above a table that may name only the bonds actually sold when one leg was
   cancelled. Scoring by bond count picked the title, whose word positions are prose
   positions. Both bonds' figures then landed in one column and the coupon cell read
   `15.03916.844`.

**The safe fix was not the obvious one.** `find_header` now returns ranked candidates and
the caller keeps whichever makes the table parse. Ranking by *fields recovered* looks
natural and is unsafe: on the cancelled-leg file both geometries recover exactly one
field, and the title's columns hang that coupon on the **cancelled** bond. A wrong number
against a real bond name is the worst thing this parser can produce. Ranking by column
**coverage** separates them — 1 of 2 columns filled versus 1 of 1.

### 12. CBR rate-cycle history — shipped 2026-07-25
119 MPC decisions from December 2008, scraped from CBK's own press table, with each
point linking back to the original press release. Turns the static "CBR 8.75%" into the
path that explains it: ten cuts from 13.00%, now held twice.

Deliberately anchored to the **current cycle**, not the 2011 record high — comparing
today against 18.00% would present a 9.25-point easing that never happened as one move.
This is the kind of detail that makes a chart either informative or quietly misleading.

---

## Later — reach

### 8. Custom domain — done 2026-07-25
`mwangazayield.org` is live. The app now publishes that address in link previews and in
every shared summary, which was the whole point: a link forwarded on WhatsApp is kept,
and it had to outlive the launch address rather than pin the project to it.

The URL had been written out in three separate files. It is now one constant in
`src/lib/share.ts` with a test asserting it is not a deploy-generated host — a move that
half-happens is worse than one that has not started, because the links it leaves behind
look fine to everyone except the people clicking them.

**Left to the Netlify dashboard on purpose.** Redirecting the old
`mwangazayield.netlify.app` to the new domain is what the "primary domain" setting
already does, and hand-writing a host redirect in `netlify.toml` would duplicate it while
risking the per-PR `deploy-preview-*` hostnames. Worth confirming the primary domain is
set to `mwangazayield.org` there.

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

**9 → 15 → 46 of the 59 outstanding bonds.** The jump came from making the parse
incremental: a daily job could only afford a dozen of 280 result PDFs and re-read the
same dozen every day, which was the real ceiling. Reading each file once and keeping the
result raised coverage and produced the yield history in the same change.

**Two of those 46 were a bug, not a data gap.** `IFB1/2023/6.5` and `IFB1/2024/8.5` have
FRACTIONAL tenors, and all three issue-code patterns in the pipeline assumed whole years —
so they matched as "6" and "8", never joined the register, and sat in the "no auction
result parsed yet" list looking like an ordinary gap. They are tax-free infrastructure
bonds paying 17.93% and 18.46%, which is to say the two most attractive instruments in
the entire dataset were invisible, silently, in an app whose central argument is that
tax-free infrastructure bonds are the best deal available to a Kenyan retail investor.
The padding rules now live in `common.py` so the next surprise is handled once rather
than three times.

The remaining 13 are named in the log every run. They are older IFBs whose auctions sit
further back in the archive than we have read, plus two whose PDFs parsed without a
coupon — the header/label defect diagnosed and fixed above.

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
- **A Swahili edition.** Dropped 2026-07-25 at the owner's direction. Worth noting what
  this does NOT change: the plain-language work stands on its own merits. The glossary,
  the "what this means for you" panels and the refusal to write "clearing yield" without
  explaining it were never a substitute for translation — they exist because most readers
  meet a bond for the first time here, in whatever language.

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
