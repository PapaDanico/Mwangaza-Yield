# Review of "Mwangaza Yield — Technical & Analytical Handover Document" v1.0

**Reviewed:** 2026-07-29 · **Against:** this repository at `main`

---

## Verdict

The document is an **outside-in reconstruction of the product from its public
website**, presented in the register of an insider handover. It is a
respectable product brief at that level. It is not a handover, and it should
not be relied on for numbers or for architecture.

The document says so itself if you read the headings: §2.3 is marked
"Inferred", §6.1 says "Likely", and all four questions in §10 are answerable
from the repository in under a minute. Whoever wrote it never had the code.

Two consequences follow, and the second matters more than the first.

---

## 1. Five factual errors

| § | Claim | Actual | Source |
|---|---|---|---|
| 3.2 | CBR **9.25%** | **8.75%** | `public/data/macro.json`, CBK MPC 2026-06-09 |
| 3.4 | "CBR down **375bps** since Aug 2024" | **425bps** — arithmetic off the wrong CBR | derived |
| 3.2 | T-bill **"rates"** 8.78 / 8.95 / 9.04% | Those are **discount rates**, not yields. Net EAY ≈ 7.87 / 8.14 / 8.45% | `public/data/tbills.json` |
| 3.3 | Retail minimum **KES 50,000** | Bills **100,000**; bonds 50,000 | `tbills.json` (`minInvestmentKES`) |
| 10.2 | Day count "Actual/Actual or Actual/365 — verify" | **Actual/364**, coupon periods of exactly 182 days | `src/lib/financial-engine.ts` |

The T-bill row is the serious one. It lifted this project's published discount
rates and relabelled them "Rate". Converting a discount quote into a return is
the single thing the T-Bill Translator exists to do, and §2.2 of the same
document describes that feature approvingly. A handover that reproduces the
error the product was built to prevent is worse than no handover.

The day-count question is the same shape. `financial-engine.ts` opens with
several paragraphs on why Kenya runs a 364-day year and a 182-day coupon
period — "this is not an ordinary convention". The document lists it as open
and guesses two wrong answers.

### Unverified, and load-bearing

§3.4 states the 2026 MTDS "explicitly targets eliminating 364-day bills".
`public/data/fiscal-context.json` records the MTDS as targeting a reduction in
the **T-bill share of total debt**, 7.3% → 5.3% by 2029. Reducing a share is
not eliminating a tenor, and the document builds a "removes a key liquidity
instrument for retail investors" conclusion on top of it. Treat as unverified
until someone reads the MTDS.

---

## 2. All three "proposed" analytical layers already exist

This is the finding that decides what to do with the document.

| Proposed | Status | Where |
|---|---|---|
| **Layer 1** — auction microstructure | **Shipped** | `src/lib/subscription.ts` (bid-to-cover, auction-level), `src/lib/bid-dispersion.ts` (all-bid vs accepted spread), rendered by `DemandRecord` on `/auctions` |
| **Layer 2** — real return & inflation | **Shipped** | `src/lib/real-yield.ts`, exact Fisher |
| **Layer 3** — cash-flow seasonality | **Shipped** | goal planner month grid, `src/lib/holidays.ts` rolling coupons to the next business day, ICS exports |

Layer 1 was the section worth taking seriously — descriptive, no new data
source, genuinely useful. It is also already built, and built more carefully
than the document proposes:

- **Bid-to-cover is computed per auction, not per record.** `bidsReceivedKESM`
  is per bond; `amountOfferedKESM` is per auction, and one auction routinely
  offers several bonds against a single pot. Divided record by record the
  archive reports a median of **0.72 with 65% of auctions undersubscribed**.
  Summed to the auction, the shipped code reports **1.19× across 224 auctions**
  — a market that behaves like Kenya's. `subscription.ts` already does the
  second thing. (An independent re-derivation for this review, using a stricter
  filter that drops any auction with an incomplete bid set, gives 1.23 across
  213. The two agree on the shape and disagree only on which partial auctions
  to admit; the page's figure is the reference.)
- **`bid-dispersion.ts` carries a warning the document could not have known**:
  until a parser fix, the market and accepted rate fields held the same value
  in every record, so dispersion measured identically zero 244 times and looked
  like a market with no disagreement in it.

**Three of the document's five Layer-1 metrics cannot be built at all.** Tail
size, the rejection heatmap and retail-versus-institutional share each need the
distribution of individual bids. CBK publishes summary tables, not bid books.
The document lists them as data requirements that are "already collected"; they
are not, and no amount of work on this archive will produce them.

### §4.2 has the terminology backwards

It labels `nominal − inflation` the "Fisher approximation" and then gives
`((1+nominal)/(1+inflation))−1` as the exact formula. Subtraction is the
approximation; Fisher is the exact form. At Kenyan rates the difference is
about 0.3pp. `real-yield.ts` already uses the exact form, and so does JiPange —
verified identical, so the two products cannot disagree about a real yield.

---

## 3. One recommendation to decline

§6.2 proposes server-side rendering for `/dashboard/`. The app is a **static
export**, chosen for offline-first operation behind a service worker — which
§6.1 of the same document describes approvingly two pages earlier. Skeleton
states already exist (`Reserve`).

The underlying observation is fair: the dashboard does fetch its JSON
client-side. The prescription contradicts the product.

---

## 4. What is worth keeping

- **§2.1's NSE note.** Correct, and it matches the decision already taken: no
  exchange-sourced or secondary-market prices are published or implied.
- **§5.1's tax-equivalent formulas.** Correct as written.
- **§8's non-goals.** Sound, and consistent with how the product is built.
- **§7's design principles.** A fair reading of the site from outside.

---

## 5. What to do with it

Retitle it a **product brief**, correct the five figures, mark §2.3/§6.1 as
what the code actually does, and delete §10. Then it is a useful outside
perspective on a product that already does most of what it recommends — which
is worth having, provided nobody quotes its numbers.
