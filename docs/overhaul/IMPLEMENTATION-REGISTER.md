# Mwangaza Yield: implementation register and release-readiness, 15 Nov 2026

Written against the owner's technical-evaluation brief. Rules used: a defect is *confirmed* only when reproduced or read from a real output; a risk without a reproduction is *suspected*; nothing is certified without evidence listed beside it. Where this session did not verify something, it says so. GitHub Actions is down (billing), so no GitHub CI evidence exists; local gates (`npm run ci`, `verify:sw`) and Netlify's deploy record are the evidence.

## A. Done this session, with evidence
| ID | Sev. | Component | Defect and evidence | Fix | Tests / acceptance | Status |
|---|---|---|---|---|---|---|
| M-01 | Medium | `GoalReport` (capital preservation PDF) | Export called CBK's quoted bill rate a "discount ... earned on a smaller outlay" and carried the bond footer ("Actual/364", "coupon dates"). Read from a real export. The engine is right: price = 100 / (1 + rate x days / 365), recorded against CBK's printed prices in `tbills.ts`. | Wording, label and a bill-specific footer with auction date and 15% WHT; plan carries `auctionDate`. | Independent price benchmark (`goals.test.ts`); static copy checks. | Fixed #446 |
| M-02 | Medium | `GoalReport`, `GoalsClient` (passive income) | "Every month Ksh 39,048" beside months of 32k to 46k. | "Average per month", screen and PDF. | `report-provenance.test.ts`. | Fixed #446 |
| M-03 | Low-Med | `ReportActions` | Exported PDFs had no Title, Author, Subject or language. | `setProperties`, `setLanguage('en-GB')`. | e2e reads them from a real download. | Fixed #446 |
| M-04 | Low | `GoalsClient`, `goals.ts` | Years-of-fees field showed 11 while the plan used 10 (and 9 against the old cap of 8); form held its own copy of the cap. Owner asked for 1 to 10 years. | One constant `MAX_FEE_YEARS = 10`, read by planner and form; field clamps. | Ten-year and eleven-year boundary tests. 10-year PDF inspected: one A4 page, ten rows, shortfall column reconciles to the headline. | Fixed #446 |
| M-13 | Medium | `cbk-gaps` | Combined body cut at 38,000 chars then all documents marked read; three regulator documents lost permanently. | One post per document; read key includes the phrases. | `cbk-gaps.test.ts`; 15 Nov run delivered three separate posts. | Fixed #441 |
| M-14 | Medium | Release process | Direct pushes changed a precached chunk with no service-worker bump; `verify:sw` caught it. Also: `verify:sw` reads the existing `out/`, so re-running it on another commit proves nothing without a rebuild. | SW v129 onward; note in `CLAUDE.md`. | `verify:sw`. | Fixed #440 |
| M-15 | Medium | `cbk-watch` `bulletinFigures` | Read a global-economy core-inflation sentence (2.1) as Kenya's core while the real figure was 4.3. | Read only from Kenya's headline paragraph; null otherwise. | Parser tests. | Fixed #439 |
| M-16 | Low | Layout and type | Mobile dashboard 7,366 px; three font families, 226 KB of fonts per page. | `MobileFold`, desktop pairing; one sans plus mono. Measured: mobile 4,277 px (4,399 after fonts), fonts 117 KB. | Browser smoke, layout shift, new `type-scale.test.ts`. | Done #444, #445 |
| M-17 | Feature | `ladder.ts`, `ladder-analysis.ts` | Ladder gave no reasoning and no exposure analysis. | Selection record, smooth-income objective, analysis card (duration, +/-1 point scenarios, concentration, tax mix, coupon months, price quality, curve gap, real yield). | 19 tests with independent benchmarks. On real data smooth-income changed the ladder in 2 of 24 settings: a modest effect, stated. | Done #447 |
| M-18 | Risk | `financial-engine.ts` coupon schedule | **Suspected, reproduced on a synthetic bond:** a maturity not a whole number of 182-day periods after issue ends in a stub paid as a full coupon (25.2% gross yield on a 12.5% bond at par). All 59 real bonds are aligned within 3 days, so it is not a present defect. | Guard test on the data; hazard documented. Engine behaviour deliberately unchanged. | `bond-schedule-alignment.test.ts`. | Guarded |

## B. Open, in the brief's order of priority
### Financial engine (critical first). Not independently re-verified this session unless stated.
| ID | Item | State | Evidence needed to close |
|---|---|---|---|
| F-1 | Amortising infrastructure bonds: the purchase-yield engine assumes a bullet; prospectus-level principal schedules and holder eligibility not modelled (`docs/FINANCIAL-ENGINE-AUDIT-2026-11-13.md`). | Open, known | Prospectus schedule per issue (only IFB1/2015/012 has one in the data); reproduction against it |
| F-2 | Coupon accrual across off-cycle repayments. | Open, known | Same prospectus schedules |
| F-3 | Withholding tax: 15% bills and bonds under ten years is supported by the Income Tax Act text read on 15 Nov (Third Schedule: 10% housing bonds, 20% bearer, 15% other). **The 10%-at-ten-years rule and 0% infrastructure-bond treatment are not in that 2017 revision and are unconfirmed.** | Open | Finance Act text (`cbk-gaps` retries 16 Nov); do not change rates before then |
| F-4 | Reconcile engine against the pinned broker quote; per-issue source provenance. | Open, known | Broker quote and issue sources |
| F-5 | T-bill discount-rate versus investment-yield convention. | **Verified** against CBK's printed price lines (documented in `tbills.ts`), re-benchmarked independently (M-01). | Closed |
| F-6 | Accrued interest, clean and dirty price, switch worked example. | Covered by existing pinned tests (`switch.ts` against CBK's own worked example). Not re-run independently here. | Re-derive from the prospectus if challenged |

### Report integrity
| ID | Item | State |
|---|---|---|
| R-1 | Visual regression of real exports. Done: ladder, FIRE, school fees (4 and 10 years), passive income, capital preservation at 1280 px; repeat exports of two reports (same size, bytes differ only near the end of the file, not examined further). **Not done:** 20+ holdings, extreme inputs, 390 px and installed-PWA environments. | Partly done |
| R-2 | Exports are raster with an invisible, approximately aligned text layer and are untagged. A selectable-text, tagged PDF means re-implementing the layout in PDF primitives (or a PDF library) and keeping two renderers consistent. Recommendation: a text-first export for the four goal reports only, behind the same button, with figures drawn from the same plan objects; keep the raster path as fallback. | Proposal, not started |
| R-3 | Receipt checksum label (djb2 fallback no longer labelled SHA-256). Fixed by the direct push `708f40f`, covered by tests; not re-exercised on a downloaded receipt. A checksum is not a signature. | Fixed, partly verified |
| R-4 | The ladder report does not yet carry the new analysis (duration, concentration, flags). | Not started |

### Portfolio and market intelligence
Existing and reused: coupon and principal calendar (`portfolioCashFlows`, ladder calendar), duration and convexity (`riskMetrics.ts`), carry and roll-down, reinvestment evidence, school-fee liability matching (`planSchoolFees`). Not yet done: the analysis layers on the user's own `/portfolio/`; convexity shown in the UI; an inflation-sensitivity scenario on the ladder; instrument-level data-quality badges outside the ladder.

## C. Release-readiness assessment
- **Evidence in hand:** local `npm run ci` 10/10 after each merge (SW digest recorded per release), `verify:sw` passing, deploys verified from Netlify's record (state, commit, functions, edge function, secret scan). Real PDFs were generated and read.
- **Certified:** nothing beyond the items marked Verified above. In particular the amortising-bond, off-cycle-accrual and statutory-rate items in F-1 to F-4 are **not** certified.
- **Known acceptable reds:** GitHub Actions (billing), Vercel status, Netlify previews off by design, Lighthouse best-practices 0 artefact.
- **Recommendation:** the current `main` is releasable as a calculator for education with its stated assumptions; do not describe its tax treatment of 10-year-plus and infrastructure bonds as statute-verified until F-3 closes, and do not claim accessible PDFs.
