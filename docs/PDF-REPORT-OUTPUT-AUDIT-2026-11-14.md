# PDF and report output audit — 14 November 2026

## Scope and evidence
Repository source inspection of `src/components/report/ReportActions.tsx`, `GoalReport.tsx`, `LadderReport.tsx`, `RealTermsNote.tsx`, `src/lib/report-styling.ts`, `src/lib/receipt.ts`, and existing report/receipt tests. The PDF path rasterises an HTML sheet using html2canvas-pro, adds an invisible jsPDF text layer, and saves a one-page PDF. This is **source audit**, not an assertion that every generated PDF has been visually inspected.

## Corrected
1. **Persistent style mutation across downloads (high):** `renderSheet` applied inline padding and box-sizing without restoring them. Both are now saved and restored in `finally`, including error paths.
2. **PDF-specific style leak (high):** `downloadPdf` applied additional padding and box-sizing *after* capture, outside the capture cleanup. Removed.
3. **Searchable text alignment (medium):** text run rectangles were collected before waiting for font readiness. Fonts are now awaited before candidate-width measurements and text rectangles are collected after final font settling, with capture dimensions remeasured.
4. **Misleading receipt verification label (medium):** Markdown receipts previously labelled the non-cryptographic djb2 fallback as SHA-256. The displayed algorithm now matches the actual prefix.
5. **Regression coverage:** added static tests for restored styles and font-before-text ordering.

## Existing safeguards confirmed by source inspection
- One-page A4 PDF image fit follows content orientation, preserving the whole image rather than cropping.
- PDF has a searchable but invisible text layer; visible text remains rasterised and is not independently accessible as vector text.
- A style-loss heuristic samples the report body below the logo.
- Goal report caps printed income holdings at 12 and declares omitted rows; printed financial figures are derived from plan data.
- Both reports show source/date and calculation-not-advice provenance.

## Open verification and quality gates
- **Must perform visual regression on actual downloaded PDFs** from ladder, FIRE, school-fees, passive-income and preservation scenarios, including 20+ holdings, extreme figures and mobile/PWA environments. Verify A4 page count, no clipped text, legibility, typography, logo, charts, footer, text search/copy, and repeated downloads.
- **Text layer accuracy:** wrapped-line extraction distributes words approximately by rectangle widths. This can misalign selections and scramble reading order; requires PDF text extraction and screen-reader testing. No certification of accessibility is implied.
- **Image-based PDF:** screenshots make files larger and visible text non-vector; a tagged, accessible PDF requires a distinct export design.
- **Financial provenance:** coupon conventions, amortisation schedules, tax rules and real broker-quote reconciliation must be validated against issue-level sources before treating report numbers as authoritative.
- **Receipt hash:** a checksum identifies input/formula content but is not a digital signature or third-party authenticity verification. Fallback djb2 is non-cryptographic.
- **Release gate:** GitHub Actions was previously failing before executing job steps. No passing full build, browser smoke run or production deployment has been established in this audit.

## Required acceptance tests
1. Export each report twice without reload; compare page geometry and source element computed styles before/after.
2. Export after font cache cold start; check PDF text selection overlays the rendered glyphs.
3. Generate receipts with SHA-256 and forced crypto-unavailable fallback; verify labels and stable hash semantics.
4. Test A4 output with maximum planner inputs and verify every omitted holding is explicitly counted.
5. Run TypeScript, unit tests, e2e PDF rendering, and inspect actual PDF render screenshots before one consolidated deployment.
