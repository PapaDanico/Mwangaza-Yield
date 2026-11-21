# Platform upgrade backlog, 21 November 2026

Ranked by value to the investor against effort. **Several of the brief's priorities already exist**, so the backlog is mostly extension, not new build.

| # | Upgrade | State today | What is actually missing | Effort |
|---|---|---|---|---|
| 1 | Unified bond quote and yield comparison | `/calculator/`, `/prices/`, `/sell/`, `tbill-vs-bond` | A single view that puts a bill, a bond and an IFB side by side net of tax and inflation | M |
| 2 | Portfolio cash-flow calendar | `portfolioCashFlows.ts`, `ics.ts` export, `/ladder/` | A month grid on `/portfolio/` (the data and calendar export exist) | S |
| 3 | Duration and rate-risk calculator | `rate-shocks.ts`, `carry-rolldown.ts`, shocks table on `/sell/` | Surface duration and the break-even yield rise on the calculator result | S |
| 4 | Inflation-adjusted return | `RealYieldCard`, `real-yield.ts`, `real-history.ts` | Already built; only wording on core vs headline CPI | XS |
| 5 | Auction forecasting accuracy dashboard | `predictions.ts`, calibration, public track record | Already built | none |
| 6 | Freshness and status indicators | `data-freshness.ts`, Data Health, per-series budgets | Already built | none |
| 7 | Exportable investor reports | Report PDFs with text layer | Re-certify every report after font and layout changes | S |
| 8 | Performance monitoring and regression tests | `npm run ci`, e2e, CSP, SW guard, CLS guard | Add a 320 px width and an axe pass to the e2e (would have caught MY-01 to MY-06) | S |

Recommended first: item 8 (cheap, and it locks in Batch A), then 3 and 2.
