# Audit findings, 21 November 2026 (read-only phase)

Head audited: `origin/main` at `585567b` plus the draft branch (service worker v149). Nothing here was changed in product code. Only **confirmed, reproduced** items are listed as defects; everything checked and found correct, and everything not confirmed, is listed separately.

Baseline: `npm run ci` 10/10 (typecheck, lint, 1,666 unit tests, engine smoke, browser smoke, CSP, service-worker shell, scraper parsers, archive integrity). The sweep below ran against the production build served locally at 320, 375, 390, 768, 1024 and 1440 px across 27 routes, with axe-core 4.10 (WCAG 2.0/2.1/2.2 A and AA plus best-practice rules) at 390 and 1440 px.

## Confirmed defects

| ID | Sev | Where | Reproduction | Root cause | Proposed fix | Regression test |
|---|---|---|---|---|---|---|
| MY-01 | P2 | Every route at 320 px | Open any page at 320 px wide: the page scrolls sideways by 14 px (document 334 px, viewport 320). | The navbar's right-hand cluster ("Data", ⌘K, icon link) is 146 px wide with `ml-auto` and does not shrink; it ends at x=334. | Hide the ⌘K hint and shorten "Data" below 360 px, or allow the cluster to wrap; keep the 44 px touch targets. | Add 320 px to the e2e overflow check (it currently starts wider). |
| MY-02 | P2 | Five-stage progress indicator on 26 route/width pairs | axe `aria-progressbar-name`: `<div role="progressbar" aria-valuenow=…>` has no accessible name. | The indicator is a bare `role=progressbar` with values but no label (WCAG 4.1.2). | Add `aria-label="Your progress through the tools"` and `aria-valuetext="Step 2 of 5: Analyse"`. | Unit assertion that every `role="progressbar"` in the component carries a name. |
| MY-03 | P2 | Provenance badge ("Official notice") on `/dashboard/` | axe `aria-prohibited-attr`: `aria-label` on a `<span>` with no role. | `aria-label` is ignored on a generic span, so the "Transcribed from the publisher's own document…" explanation is lost to screen readers. | Put the text in visually-hidden content or give the span `role="img"`. | Same assertion on the badge component. |
| MY-04 | P3 | Current-step label ("Discover", "Analyse", "Plan") | axe `color-contrast`: `#b45309` on `#f7f2e7` measures 4.49:1 at 12 px; AA needs 4.5:1. | `text-gold-700` is 0.01 short on the sand background for small text. | Use the next-darker gold for this label only. | Extend the contrast floor test to small text on `sand-100`. |
| MY-05 | P2 | Scroll regions on `/ladder/`, `/portfolio/`, `/feed/` | axe `scrollable-region-focusable`: a horizontally scrolling chart or table cannot be reached by keyboard. | Overflow containers without `tabIndex=0` and an accessible name (WCAG 2.1.1). | Add `tabIndex={0}`, `role="region"` and `aria-label` to those containers. | e2e: Tab reaches the region. |
| MY-06 | P2 | `/yield-curve/` and `/feed/` | Two `<main>` elements, one nested inside the other (`main#main` inside `main`). | The page component renders its own `<main>` inside the layout's `<main>`. | Change the inner element to `<div>` or `<section>`. | Unit/e2e: exactly one `main` per route. |

## Checked and found correct (do not re-open)

- **Bond engine against an independent reference** (see `FINANCIAL_TEST_RESULTS.md`): accrued interest, gross and net yield agree to four decimals on eight cases across par, premium, discount, tax-exempt, near-maturity and 30-year bonds.
- **T-bill price and yields**: the code's 365-day true-discount convention reproduces CBK's own "price per 100" line (verified against the 3 Aug 2026 notice cited in `tbills.ts`) and the 19 Nov rates feed.
- **All 59 bonds in `bonds.json` sit on the 182-day coupon grid**, so the schedule always lands on maturity; no real bond can reach the odd-date path.
- **Dependency advisories are not reachable.** `npm audit` reports 5 (1 critical) on runtime dependencies, but the critical is Next.js self-hosted-server issues (image optimiser, RSC deserialisation, rewrites). The site is `output: 'export'` with `images.unoptimized` and no rewrites, so there is no server to attack. `dompurify` is only a transitive dependency of `jspdf` and is not called by the app. Classified P3 supply-chain hygiene, not a production exposure.
- **No console errors or page errors** on any route at any width. Failed requests seen during the sweep were fetches cancelled when the script navigated away mid-load; they are not defects and were not reproduced on a settled page.

## Not confirmed (hypotheses, not defects)

- axe `link-in-text-block` (5 instances): inline links may rely on colour alone. Needs a per-link check against the surrounding text colour before it counts.
- axe `region` (content outside landmarks, moderate): the progress indicator sits outside a landmark. Cosmetic for assistive technology; fold into MY-02.
- WCAG 2.2 target size (2.5.8): only spot-checked; the 44 px navbar targets pass, other controls not measured.

## Tax assumptions

- 15% on bill and ordinary bond interest is supported by the Income Tax Act (Cap 470, Rev. 2017), Third Schedule, "qualifying interest".
- **10% at ten years or more and 0% for infrastructure bonds are not confirmed against statute.** Secondary sources agree on 10%; the Tax Laws (Amendment) Act 2020 removed the old exemption list and the Finance Bill 2024 proposed repealing the infrastructure-bond exemption. `cbk-gaps` has been pointed at KRA's consolidated Income Tax Act 2026 to settle both; the engine is **not** changed until that text is read. See `docs/overhaul/LEGAL-REVIEW.md`.

## JiPange handover: verification of the 21 Nov findings (read-only, `0a5f23b`)

| ID (handover) | Verified | Result |
|---|---|---|
| JP-01 inconsistent annualised cost indicators | Source read (`lib/loan-comparison.ts`) | **Confirmed, P1.** SACCO is compounded `(1.01)^12-1`; the bank figure is the nominal 15% used as if effective (the compounded equivalent is 16.08%); mobile-lender flat rate uses an approximation formula; Fuliza and M-Shwari use their own conventions; tiers green/amber/red are heuristic. The numbers are labelled illustrative, but they are shown side by side as comparable. |
| JP-02 loan-quote IRR uses unrounded payment | Reproduced with an independent rounded-schedule IRR | **Confirmed but downgraded to P3.** Difference is 0.01 bp at Ksh 10,000 over 12 months, 0.8 bp at Ksh 500 over 3 months, ~0 for large loans. It only becomes material below about Ksh 1 (a 4-cent loan differs by 949 bp), which is not a realistic input. Sub-cent principal returns `null` correctly, so the "zero net proceeds" concern does not occur. |
| JP-03 household balance precision | Not reproduced in this pass | Open; needs a 12-month accumulation test. |
| JP-04 rate provenance fields | Source read | Consistent with the handover: `generatedAt` 20 Nov, `pipelineRanAt` 19 Aug, rows "entered by hand". Mwangaza's own policy already forbids stamping `pipelineRanAt`; the gap is JiPange's labelling. Open, P2. |
| JP-05 PDF text-layer completeness | Verified earlier this session by re-exporting | Text layer present and spacing correct on the exports tested on 16-20 Nov (see `PDF-AUDIT-2026-11-16.md`). A full re-export of every report with `pdftotext` comparison is still to be done. |
| JP-06 short-term credit scaled to term loans | Source read | **Confirmed, P1** (same module as JP-01): Fuliza and M-Shwari are scaled to the loan term. |
| JP-07 stale implementation register | Not checked | Open, P3 documentation. |

## Implementation plan (nothing below has been started)

1. **Batch A, accessibility and layout (Mwangaza MY-01 to MY-06):** small, local, no formulas touched. One PR, gates plus a 320 px e2e check. Needs your approval to merge.
2. **Batch B, JiPange borrowing comparison (JP-01, JP-06):** replace the universal APR column with the actual cost over a stated horizon, show fee-inclusive IRR only for fully specified cash flows, mark Fuliza and M-Shwari non-comparable to term loans, drop the heuristic tiers. This is a methodology change: **I will bring reference cases and the proposed wording for approval before editing.**
3. **Batch C, tax:** apply the Income Tax Act 2026 reading to `determineWHTRate` and JiPange `rates-feed.ts` once `cbk-gaps` has posted it. Reference cases first.
4. **Batch D, JiPange provenance and PDF certification (JP-04, JP-05, JP-03, JP-07).**

No deployment happens without your approval.
