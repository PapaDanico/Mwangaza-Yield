# The six handover documents, reviewed as one

**Reviewed:** 2026-07-30 · **Against:** this repository and JiPange at `main`

Six documents arrived over three days:

| # | Document |
|---|---|
| 1 | `mwangaza_yield_handover.md` — reviewed separately in [HANDOVER-REVIEW.md](HANDOVER-REVIEW.md) |
| 2 | `pesa_smart_ke_integration_handover.md` |
| 3 | `cma_kenya_integration_handover.md` |
| 4 | `jipange_mwangaza_comprehensive_integration.md` |
| 5 | `claude_code_implementation_handover.md` |
| 6 | `government_communications_integration_handover.md` |
| 7 | `analytical_depth_enhancement_handover.md` |

---

## Verdict

They are one document family, not six independent opinions, and that matters
more than any individual finding.

They share an authoring pipeline, cross-reference each other, and inherit each
other's errors. Document 1 was established to be an **outside-in
reconstruction of the product from its public website** — its own headings say
"Inferred" and "Likely", and every question in its §10 is answerable from the
repository in under a minute. Documents 2–7 build on that foundation without
ever having acquired the code, so a figure corrected in HANDOVER-REVIEW.md
reappears uncorrected in document 5.

**Treat them as an outside perspective on the product, which is genuinely
worth having, and never as a source for numbers or architecture.**

The single most important consequence: a claim from any of these documents
must be checked against the repository or against a primary source before it
is acted on. That is not a general caution. It is the specific failure mode
this family exhibits.

---

## What is already built

The pattern repeats across documents. Proposals arrive as new work; the work
ships already.

| Proposed | Status |
|---|---|
| Auction microstructure (bid-to-cover, dispersion) | `src/lib/subscription.ts`, `src/lib/bid-dispersion.ts` |
| Real return and inflation | `src/lib/real-yield.ts`, exact Fisher |
| Cash-flow seasonality | goal planner month grid, `src/lib/holidays.ts`, ICS export |
| Inflation-source disclosure | `MacroReading.fallback`, `inflationAttribution()` in both products |
| A published cross-product figures contract | `scripts/build-rates-feed.mjs`, consumed by JiPange |

---

## What cannot be built, and why

Three of the proposed Layer-1 metrics — tail size, a rejection heatmap, and
retail-versus-institutional share — each require the **distribution of
individual bids**. CBK publishes summary tables, not bid books. The documents
list these as data requirements that are "already collected". They are not,
and no amount of work on this archive will produce them.

Anything NSE-adjacent is out by standing policy: no exchange-sourced or
secondary-market prices are published or implied. Document 1's own §2.1 gets
this right; later documents drift back toward it.

---

## What to decline

- **Server-side rendering for `/dashboard`** (document 1, §6.2). The app is a
  static export, chosen for offline-first operation behind a service worker —
  which §6.1 of the same document praises two pages earlier. The underlying
  observation, that the dashboard fetches its JSON client-side, is fair. The
  prescription contradicts the product.

- **Cross-product deep links with pre-filled state.** Checked rather than
  assumed: neither `src/app/calculator/page.tsx` nor `src/app/goals/page.tsx`
  reads `searchParams` or `useSearchParams`. These are not URL-parameter
  changes, they are new work in both pages, and the documents cost them as
  though the plumbing existed.

---

## What only the user can supply

The P0 legal items — company registration number, registered office address,
data protection officer contact — are facts, not code. Nothing here can
generate them and nothing should invent them. Note that `hello@jipangefinance.org`
is allowlisted in the privacy guard and `partners@jipangefinance.org` is
deliberately **not**, because that mailbox does not exist; a document
proposing it as a contact address is proposing an address that bounces.

---

## Corrections these documents carry forward

Already recorded in [HANDOVER-REVIEW.md](HANDOVER-REVIEW.md): CBR is 8.75%,
not 9.25%; the T-bill quotes are discount rates and not yields; the retail
minimum is 100,000 for bills; the day count is Actual/364; the CBR has fallen
425bps, not 375. Document 5 repeats the `KRA_BANDS_2026` shape and claims a
JiPange copilot that does not exist.

**One correction runs the other way**, and it is worth stating plainly because
it was mine. The 364-day phase-out is real — announced, reported in January
2025, and set out in the 2026 MTDS. My initial scepticism was wrong. What the
documents get wrong is the tense: the tenor was still clearing on 30 July 2026
and was on offer again for the 6 August close. It is under notice, not gone —
though now thinly bid, at a 47.93% performance rate against 180.04% at 91 days.

---

## The brand assets

Reviewed alongside these documents, and the verdict is the same shape: do not
adopt.

The pack's JiPange tagline is **"Plan. Save. Grow."** and the Mwangaza banner
promises **"Real-time Kenya sovereign yield curves"**. Both read well. Both
would introduce exactly the claims the handover documents' own forbidden-word
list bars — "grow" is on it, and document 1's §7.3 specifies *Plan. Save.
Track.* Neither codebase contained either phrase; that was verified before
writing this, which is why the response is a guard rather than a cleanup.

"Real-time" is false about the mechanism rather than optimistic about it:
every figure is a committed snapshot of a published auction, dated on the page,
and there is no market feed to stream from. The mock application screenshot in
the pack also shows fictitious data — a 13.45% IFB, a May 2024 auction — and
CTA styling that is not in the product.

Enforced by `tests/unit/brand-claims.test.ts` here and
`lib/__tests__/brand-claims.test.ts` in JiPange. The JiPange guard found two
real instances on its first run: advice copy calling debt clearance "the
highest guaranteed return", and a footnote telling readers to "check live
rates". Both were reworded.

---

## What is worth keeping

- The **NSE note** (document 1, §2.1) — correct, and matches the decision
  already taken.
- The **tax-equivalent formulas** (§5.1) — correct as written.
- The **non-goals** (§8) — sound, and consistent with how the product is built.
- The **CMA secondary-bond-market material** (document 3) is the most
  substantive new content in the family, and the one place these documents
  point at something real that this project does not yet use. It is also the
  one that most needs checking against CMA's own publications before any
  figure from it is quoted, for the reasons above.
- The **Treasury press-release figures** (document 6) — KSh 961.7B FY25/26,
  KSh 987.36B FY26/27, 5.3% Q1 GDP — are new and citable **after
  verification**, per that document's own protocol.

---

## What to do with them

Retitle the family **product briefs**, correct the figures listed above, mark
the inferred sections as what the code actually does, and delete the open
questions. Then they are a useful outside perspective on a product that
already does most of what they recommend — provided nobody quotes their
numbers.
