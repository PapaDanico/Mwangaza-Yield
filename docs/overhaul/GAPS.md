# The overhaul brief, checked against the repository (13 Nov 2026)

The brief (`MWANGAZA_YIELD_CLAUDE_CODE_HANDOVER.md`, supplied by the owner) was written as a hypothesis about an
unknown codebase and says so. This is the evidence-based result, so no later session re-checks it. It is a gap list,
not a baseline: `CLAUDE.md` and `docs/` already are one.

## What already exists (files confirmed present; completeness checked only where marked)

| Brief phase | Already in the tree |
|---|---|
| 2 Calculation engine, quote analyzer | `financial-engine.ts` (accrued, dirty price, YTM by bisection on dated cash flows, WHT), `switch.ts`, `sell.ts`, `quote-benchmark.ts`, quote workflow on `/prices/`. Coupons step in 182-day periods back from maturity (CBK's convention), pinned to CBK's own pricing tables to 3 decimals. |
| 5 Risk and inflation | `riskMetrics.ts` (duration, convexity), `real-terms.ts`, `real-yield.ts`, rate shocks on `/yield-curve/` |
| 6 Provenance | `licences.ts`, `data-freshness.ts`, `indicator-freshness.ts`, `via` + `sourceNote` on hand-entered data, `/sources/`, `PriceProvenance.tsx` |
| 7 Forecast accountability | Complete: `TrackRecord.tsx`, `predictions.ts`, point-in-time `backtest.ts`, calibration, sample sizes shown |
| 8 Trust and export | about, disclaimer, privacy, terms, licensing, FAQ, glossary pages; CSV on `/portfolio/`, `/prices/`, the archive; counts-only analytics (`track.mts`), pinned by tests; portfolios local-only |

## The brief's five defect hypotheses, tested

| Claim | Result |
|---|---|
| Portfolio yield is income over cost | **False.** `/portfolio/` shows a cost-weighted average of each holding's net YTM, solved from dated cash flows. Holdings with a placeholder price are excluded from the weighting, not invented into it. (It is a weighted average of YTMs, the usual convention, not a pooled IRR.) |
| Par-price fallback is unlabelled | **False.** The source (`par` / `your price` / `last traded`) travels with every price (`PriceProvenance.tsx`, `isPar` on the dashboard and landing cards), and a par price is never used to value a holding. |
| User-entered quotes are not marked user-supplied | **False.** Source `user` renders as "your price". |
| Income should fall when a bond matures | **The schedule does** (`buildPortfolioPaymentSchedule` stops at maturity). **The headline KPI did not**: "Net annual income" on `/portfolio/` and `/ladder/` is a run-rate (face x coupon, after tax) and counted a bond with four months left as a full year. **Fixed:** `nextTwelveMonthsNetCoupons` counts coupons actually paid in the next twelve months, shown beside the run-rate only when the year falls short of it. Principal is never counted as income. |
| Fees are not modelled | **Half true.** `/sell/` models commission and levies; the buy-side calculator and ladder do not. Open, not fixed: needs a decision on defaults. |

## Real gaps still open, in the order recommended

1. T-bill vs bond comparator on a common budget and horizon (nothing like it exists; bills only on `/tbills/`).
2. Homepage goal chooser routing to existing tools (needs 1 as a target; must not add scroll).
3. Rate shocks (-200 to +200bp) on `/sell/` and `/prices/` from the existing duration and convexity.
4. Ladder cash-flow calendar table and CSV with an assumptions header (check what `/portfolio/` already exports first).
5. ~~One data-status vocabulary~~ **Not built, deliberately (13 Nov):** it already exists as `ProvenanceBadge` (official / search-corroborated figures), `PriceBadge` (your price / last traded / par), `StaleDataNotice` and `DataStatus`. A fourth component would duplicate them; scenario outputs are labelled in prose.
6. ~~Methodology page and correction link~~ **Done (13 Nov):** `/methodology/`; the correction route already existed on `/support/`.
7. Buy-side fees in the calculator (decision needed on defaults).

Not recommended: rewriting the engine (test-pinned, and CBK-conformant already), a decimal money library, feature flags
(static export), accounts or sync, PDF export, any regulated-activity wording.
