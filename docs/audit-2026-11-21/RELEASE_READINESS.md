# Release readiness, 21 November 2026

**Releasing:** Batch A (accessibility and layout), the `cbk-gaps` reading of the Income Tax Act 2026, two neutral-wording changes, and the audit documents. Owner approved ("Please proceed").

| Gate | Result |
|---|---|
| Typecheck, lint, unit tests (1,669) | pass |
| Production build, engine smoke | pass |
| Browser smoke: 23 routes, layout at 320/390/768/1024/1280/1440 px, structure, contrast, CLS, console errors | pass (full gate run on the final head) |
| CSP on every route | pass |
| Service worker shell (v150, digest recorded) | pass |
| Scraper parsers, archive integrity | pass |
| Financial formulas changed | none |
| Dependency advisories | 5 flagged, none reachable on a static export (see `AUDIT_FINDINGS.md`) |

**Remaining risks:** axe `link-in-text-block` and the remaining `color-contrast` flags on chips (`border-gold-600` on `/calculator/` and `/tbills/`) are unconfirmed and queued for the next batch; WHT 10%/0% rules unconfirmed against statute until `cbk-gaps` posts the Act. GitHub Actions remains unavailable (billing), so the local gate is the release gate.

**Rollback target:** the deploy current before this merge, `6b00f0c935fb938e33efdd0c` (#468).
