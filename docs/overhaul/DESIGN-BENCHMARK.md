# Design benchmark and upgrade advice, 15 Nov 2026

Goal set by the owner: a platform that looks and reads like a serious, internationally credible financial and education product. This document says what that standard is, how Mwangaza measures against it today, and the order to close the gap. Nothing here is a claim about what McKinsey publishes: its own design guidance could not be reached from this session (`www.mckinsey.com` does not resolve from here), so the consulting-style points below come from secondary write-ups and are labelled as such.

## What was established, and how well
| Source | What it gives | Strength |
|---|---|---|
| Vanguard's published behavioural-design principles | Clear language; the most important message first; options clustered meaningfully; detail only when needed; simplified choices, helpful defaults, decisions in steps. Its 2026 redesign was phased in to collect investor feedback and aimed to stop clients assembling information from several places. | Firm's own publications, self-reported, but specific |
| Corporate Insight review of brokerage calculators | Calculators are scored on accessibility, complexity and usability; leaders import real balances. | Trade-press summary. Importing balances is out of scope here (no accounts, no stored user data) |
| Consulting-style conventions (third-party write-ups of McKinsey practice) | Action titles (a full sentence stating the takeaway, so the titles alone tell the story); one message per chart; remove anything that does not help the reader understand or remember; editorial serif or disciplined sans on a strict grid; a source line under every exhibit. | Secondary and unofficial. Treat as a style convention, not a specification |
| WCAG 2.2 AA | Normal text 4.5:1, large text 3:1; semantic tables with header associations; focus not obscured. APCA is a WCAG 3 candidate, not a standard. | Standard, but the summaries read were vendor blogs. Check criterion numbers against the W3C text before citing them |
| Fintech trust-pattern articles | Early trust cues, plain disclosure, progressive disclosure on mobile. | Vendor marketing; weak. Nothing found on data provenance specifically |

**Gap in the evidence:** no source found gives measured outcomes for Kenyan retail investors, and none covers provenance UI. The product's own provenance system (source, date, freshness per figure) is ahead of anything the benchmark sources describe, so keep and extend it rather than replace it.

## Where Mwangaza stands (measured 15 Nov, local build, Playwright)
| Page | Mobile 390px | Desktop 1440px |
|---|---|---|
| Home | 7,087 px (about 8.4 screens) | 4,205 px |
| Dashboard | 7,366 px | 5,167 px |
| Calculator | 4,592 px | 3,256 px |

Observed on the dashboard and in the code:
1. **Length without hierarchy.** Panels are full-width cards of equal weight stacked in one column. Nothing says which one matters most this week.
2. **Dead space inside cards.** The forecast card spends about 235 px on three lines.
3. **Three font families** (Plus Jakarta Sans, Roboto, JetBrains Mono), loading 8 font files and 225,648 bytes on every page. *Correction, 15 Nov:* the first draft also called 39 arbitrary font sizes "accretion"; 37 of them were `text-[12px]`, which is exactly `text-xs`, and the named scale was already in wide use (442 `text-xs`, 386 `text-sm`). That was a duplicate spelling, not a missing system, and is now guarded by `tests/unit/type-scale.test.ts`.
4. **Headings are topic labels** ("Our forecast against the result"), not takeaways. Some panels already state the point ("Locking a year pays almost nothing extra"); most do not.
5. **Strengths to keep:** provenance and freshness per figure, one honest tone, high contrast (the Tailwind comments record contrast work), tabular numerals class, a three-step elevation ramp, a calm palette.

## Recommendations, in order
**1. Layout and density (Phase 1, in progress).**
- Two-column desktop grid; collapse secondary panels on mobile by decision value; tighten the forecast card.
- Targets: mobile Home and Dashboard at or under 4,500 px; desktop Dashboard at or under 3,600 px. Layout shift stays inside the existing 0.1 budget; Reserve heights are measured, not guessed.

**2. One type and spacing system (Phase 2).**
- Two families, not three: one sans for text and headings, one mono or tabular-figure face for numbers only. Drop the third.
- A named scale (for example 12 / 14 / 16 / 20 / 28 / 40) replacing the 39 arbitrary sizes, and a 4 px spacing rhythm. Enforced by a test that fails on new `text-[Npx]`, the way the repo already guards currency labels and unguarded `Number()`.
- Tokens already exist for colour and elevation; extend them rather than adding a second source.

**3. Consulting-grade editorial conventions (Phase 2).**
- An action title on every panel and chart: a sentence that states the finding and, where a figure is quoted, is generated from the data so it can never drift from it ("The 364-day bill pays 0.02 points more than the 91-day after tax").
- One message per chart, direct labels instead of legends where possible, no decoration that carries no information, a source and date line under every exhibit using the existing provenance component.
- Absence stays visible: a missing figure shows as missing, never as zero (the repo's standing rule).

**4. Education layer (Phase 3).**
- Each tool ends with the same four-part block: what this shows, what it means, what you can do, what it assumes. This is the JiPange handover's item B3; check `ResultCard`, `LiveResult` and `CalculatorDisclaimer` first so nothing is duplicated.
- Plain-language checks on every explainer: short sentences, defined terms on first use, no advice wording (regulatory review in `LEGAL-REVIEW.md` stands).

**5. Accessibility to WCAG 2.2 AA with evidence (Phase 3).** axe on every route, keyboard-only walkthrough, screen-reader pass on the three money tables, `scope` and header associations on every data table, 44 px touch targets, reduced-motion respected. Contrast stays on the 2.2 ratios; APCA is advisory only.

**6. JiPange parity.** Apply the same tokens and block structure once Mwangaza's have settled, so the two products read as one family without sharing state.

## Rules for every phase
- Measure before and after in the PR (page heights, layout shift, Lighthouse medians over at least four interleaved runs, since a gain under about 5 points is noise).
- Every number and its provenance survives unchanged. Reuse existing components. Bump the service worker and record the digest after a fresh build. Full gates before merge.
- No new tracking, accounts or stored user data to chase a "premium" feel.

## Not recommended
- Copying a consulting firm's palette, fonts or layout. The product should look credible and its own, not borrowed.
- Importing user balances (as Vanguard and Fidelity do): it needs accounts, which the product deliberately does not have.
- Animation or imagery added for polish. It costs mid-range Android performance, and the measured ceiling for deferral gains is already modest.

## Sources consulted
Vanguard's published behavioural-design material and 2026 website redesign news release; the Corporate Insight calculator review as reported by PLANADVISER; WCAG 2.2 summaries (vendor and university pages); fintech trust-pattern articles (agency blogs); third-party write-ups of McKinsey slide and chart conventions. None is a primary specification.

## Phase 2 result (15 Nov)
Body text moved from Roboto to Plus Jakarta Sans (already shipped as one variable font). Font files per page 8 to 4, bytes 225,648 to 117,224 (-48%). Page heights moved by 0.5 to 3% (mobile dashboard 4,277 to 4,399 px). The browser guards caught three real regressions from the wider letterforms, all fixed: an 8 px sideways scroll at 768 px from the navbar, a wrapped "View details" link, and a truncated auction title.
