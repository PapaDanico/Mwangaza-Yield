# Bug fix log, 21 November 2026 (Batch A, approved by the owner)

| ID | Sev | Fix | Files | Verified by |
|---|---|---|---|---|
| MY-01 | P2 | Navbar icon cluster and row gap tighten below 360 px (touch targets stay 28-32 px wide, 44 px tall, above WCAG 2.5.8's 24 px) | `Navbar.tsx` | e2e layout sweep now includes 320 px; no route scrolls sideways |
| MY-02 | P2 | Progress bar named: `aria-label` plus `aria-valuetext` "Step 2 of 5: Analyse"; wrapper is a labelled `<section>` | `JourneyBar.tsx` | e2e structure check; axe `aria-progressbar-name` clear |
| MY-03 | P2 | Provenance badge explanation moved from a prohibited `aria-label` on a span to screen-reader-only text | `ProvenanceBadge.tsx` | axe `aria-prohibited-attr` clear |
| MY-04 | P3 | Current-step label darkened from gold-700 to gold-800 (4.49:1 to above 4.5:1) | `JourneyBar.tsx` | axe `color-contrast` no longer flags it |
| MY-05 | P2 | Nine horizontally scrolling regions made keyboard-reachable (`tabIndex=0`, labelled region) on ladder, portfolio, sell, yield-curve history, ladder analysis and the feed's code blocks | 7 files | e2e structure check: every overflowing scroll region is focusable |
| MY-06 | P2 | Nested `<main>` on `/yield-curve/` and `/feed/` changed to `<div>` | 2 pages | e2e structure check: exactly one `<main>` on 23 routes |
| MY-07 | P1 | **Found during the fix.** At 1024 px the desktop navbar overflowed by 72 px on every route (data-status chip plus ⌘K hint pushed the cluster to x=1096). Both now appear from 1280 px | `Navbar.tsx` | e2e sweep now includes 1024 and 1280 px |
| MY-07b | P2 | **Found during the fix.** `/ladder/` at 320 px overflowed by 49 px: the report row (Download PDF, Save image, Print) could not fit; it now stacks below 360 px | `ReportActions.tsx` | e2e 320 px sweep |
| MY-08 | P2 | **Found and fixed.** `/portfolio/` at 320 px: a Recharts tooltip hung off the screen (up to 68 px with the suite's holdings) whenever a finger or pointer rested on the duration or income charts; it showed as a 1-in-7 layout failure. Tooltips are capped at 200 px, kept in the chart, and clipped to the card | `RiskMetricsDurationChart.tsx`, `IncomeStabilityDashboard.tsx` | new deterministic e2e sweep of the pointer across every portfolio chart at 320 px: 68 px before, 0 after |
| MY-09 | P2 | **Found during the fix.** `MiniLineChart` (dashboard, macro, auctions, yield curve) drew its first frame at a guessed 640 px before measuring, so on a 320 px phone the page jumped sideways for a moment (`/macro/` showed 373 px). The SVG is now capped at its container's width | `MiniLineChart.tsx` | e2e 320 px layout sweep |

Tests added: 320, 1024 and 1280 px in the layout sweep (was 390/768/1440); a structure check across 23 routes (one `<main>`, named progress bars, keyboard-reachable scroll regions); culprit reporting on sideways-scroll failures. No formula, data file or financial methodology was changed. Service worker v150.
