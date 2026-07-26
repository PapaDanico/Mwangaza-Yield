# Business model and milestones

Written 2026-07-25, after the price book shipped. Ordered the way `ROADMAP.md`
orders things: **user value per unit of risk**, not by how interesting the work
is. Every claim about data below was measured against the shipped dataset on
the date written — the measurements are reproducible with the commands quoted.

The governing principle carries over unchanged: **verify the data before
building the feature.** It has now paid out five times (see `ROADMAP.md` and §0
below), and the two most expensive near-misses were both cases of a number that
was arithmetically correct and editorially wrong.

---

## 0. The constraint that decides everything

The app's value proposition is *"we never see your data, and we have no
incentive to sell you anything."* That is stated on the About page, enforced in
`push-rules.ts` (server-deliverable vs device-only), and now doubly true of the
price book, which never leaves the device.

That stance is **the moat, not a limitation.** A bank or broker can rebuild this
calculator in a quarter. What they structurally cannot do is credibly promise
they are not steering the reader. So every revenue line is tested against one
question:

> Does this survive a reader asking *"who pays you, and what do they want from
> me?"*

Two options fail that test and are ruled out, not deferred:

| Rejected | Why |
|---|---|
| **Advertising** | Trades the only durable advantage for cents per thousand views on a retail Kenyan audience. |
| **Broker / CDS referral fees** | The most lucrative-looking and the worst. Once paid per referral, every "best yield" tile is suspect — including the honest ones. |

---

## 1. Chosen direction: B2B engine licensing

**The retail PWA stays free and private, permanently.** Revenue comes from
licensing the engine and data pipeline to institutions that need the same maths.

### Why this asset is worth paying for

`financial-engine.ts` encodes Kenyan government bond mathematics that is
demonstrably hard to get right. From `ROADMAP.md`, when the day-count convention
was wrong:

- `FXD2/2018/20` had a coupon placed on a **Friday** — impossible for these
  bonds, which are issued and redeemed on Mondays without exception.
- That single bond was overstated by **KES 61,836 per million**.
- Mean error across all 58 listed bonds: **KES 7,923 per million**.

A SACCO running a KES 500M bond book on a spreadsheet with the same convention
error is mispricing by roughly **KES 4M**. That figure — not a feature list — is
the sales conversation.

The correctness is not asserted, it is tested: `engine-sweep.test.ts` runs the
engine against all 58 live bonds rather than against fixtures that agree with it
by construction, and `published-cross-check.test.ts` and
`schedule-vs-dataset.test.ts` check published JSON against the schedule.

### Buyers, in order of proximity

1. **DN Consultancy clients** — existing relationships, existing trust.
2. **SACCOs and investment clubs (chamas)** — how a large share of Kenyans
   actually hold bonds; currently served by spreadsheets.
3. **Fund managers and independent advisors** — need defensible net-of-WHT
   figures for client reporting.

### What is genuinely required (not features)

The engine is already correct and tested. The work is **packaging**, not
building:

- Extract `financial-engine`, `ladder`, `tbills`, `prices` as a versioned
  package with a stable public API and no React/DOM dependency.
- Document the conventions the engine implements, with the evidence — the
  364-day year, 182-day coupon period, WHT bands — so a buyer's auditor can
  check it rather than trust it.
- A licence boundary that keeps the PWA's data pipeline separate from any
  exchange-derived data — the engine is priced by whatever the licensee lawfully
  supplies, and we supply none.

---

## 2. Chosen next feature: auction bid assistant

### Data verification — done before designing anything

Measured 2026-07-25 against `public/data/auction-results.json` (387 records,
2009–2026):

| Field | Coverage, all 387 | Coverage, 2022+ (172 records) |
|---|---|---|
| `weightedAverageRate` | 82.7% | **100%** |
| `pricePer100` | 96.1% | **100%** |
| `bidsReceivedKESM` | 91.7% | **100%** |
| `amountAcceptedKESM` | 94.8% | **100%** |
| `amountOfferedKESM` | 94.1% | **100%** |
| `couponRate` | 96.1% | **100%** |
| `marketWeightedAverageRate` | 63.8% | 75.0% |

**Verdict: viable from 2022 onward, on 172 auctions.** Earlier years are usable
for context but not for a headline claim.

### The trap this probe found

`offeredScope` is `"auction"` on every record: `amountOfferedKESM` is the amount
offered for the **whole auction**, not for the bond in that row. Of 59
multi-bond auctions since 2022, **58 repeat the same offered amount on every
bond**.

Computing bid-to-cover per row therefore divides one bond's bids by the entire
auction's offer:

```
naive, per record:   median 0.61x   → "auctions are chronically undersubscribed"
grouped by auction:  median 1.20x   (p10 0.47, p90 2.53) → the truth
```

The naive number is not merely imprecise, it tells the opposite story. It would
have shipped as a confident, wrong claim — the exact failure mode this project
keeps catching.

**`auction-review.ts` already handles this correctly** (see its comments at
lines 69–79, which document the per-auction scope and group before dividing).
The bid assistant must reuse that grouping and must not recompute from raw
records.

### Known limits to disclose in the UI, not hide

- 13 records carry a null `auctionDate`.
- 7 multi-bond source documents name a bond in the filename with no row
  recorded — `check_archive.py` reports these as notes rather than gating on
  them, because some are CBK's own filename disagreeing with CBK's table.
- Tap sales have never parsed completely (`probe_tapsale.py`).

`archive-quality.ts` already exists to surface coverage gaps to the reader. The
assistant should lean on it rather than present a clean façade over a patchy
archive.

---

## 3. Milestones

Each milestone states what must be **true** at the end, not what will be built.
Nothing here depends on a licence, a permission, or a counterparty we do not
control — except M4, which says so explicitly.

### M1 — Trustworthy under scrutiny *(near-complete)*

The numbers survive an auditor, and the alerting survives a month.

- [x] Price provenance on every figure; par never presented as market
      (`prices.ts`, `PriceProvenance.tsx`).
- [x] Portfolio mark-to-market functional — it had never rendered for anyone,
      because it read only the empty `secondary` set.
- [x] Freshness alarm no longer fails daily on a condition that cannot be fixed.
- [x] WCAG AA contrast on sampled dashboard text; 44px touch targets on the
      most-repeated controls.
- [x] **Browser tests in CI** (`tests/e2e/smoke.mjs`). Three of the four defects
      fixed that week were invisible to 382 unit tests: a dead feature, an
      unguarded yield, and copy contradicting the data. The unit suite is
      structurally blind to "renders wrongly" and "renders nothing"; this closes
      that. Verified it can fail, by reverting the portfolio fix and watching it
      go red.
- [ ] `npm run lint` runnable in CI (`next lint` currently prompts
      interactively, which is why the workflow omits it).

### M2 — The auction bid assistant

A retail bidder can answer *"what should I bid?"* with evidence.

- [x] Grouped demand only — `demandByAuction` refuses per-record bid-to-cover,
      and refuses auctions whose rows disagree about the offer (`bid.ts`).
- [x] For the term being bid: clearing-rate distribution, median, and where a
      proposed rate falls — bucketed on **remaining term at the auction date**,
      because 57% of 2022+ records carry a misleading tenor label (re-openings).
- [x] Headline claims restricted to 2022+ (`GUIDANCE_FROM`); below 5
      comparables the panel says so instead of implying a range.
- [x] Dropped/unmatchable records counted and disclosed, not papered over.
- [x] Tests pinning both traps (`tests/unit/bid.test.ts`), mutation-verified:
      label-bucketing, per-record cover, and a flipped verdict each go red.

**Exit test:** for the next live auction, the assistant's stated range contains
the actual weighted average rate. Record the prediction *before* the result
publishes — a claim checked after the fact is not a test.

### M3 — Licensable engine

An institution can buy and integrate the maths.

- [x] Engine extracted as a versioned package, no React/DOM dependency
      (`src/lib/engine.ts` barrel; `npm run build:engine` → `dist/engine`,
      importable from plain Node; `npm run test:engine` proves the built
      artifact against the real broker sheet).
- [x] Conventions documented with their evidence (`docs/ENGINE-API.md`).
- [ ] Reference integration (a spreadsheet-shaped API is likely the real
      demand, not a JS import).
- [ ] Licence terms that keep exchange-derived data out of scope.

**Exit test:** one paying pilot, most plausibly via DN Consultancy.

### M4 — Depends on others, so it is scheduled last

- [ ] Richer auction radar — gated on CBK publishing, not on code.

**Removed from this milestone (2026-07-25): seeking NSE permission or a licence.**
Both were listed here and both are now declined on purpose. The app takes no
exchange data in any form, and the point of that is to owe nothing to a
counterparty whose terms can change under a product people rely on. The price a
plan needs is the one the reader is actually being charged, and they already
know it.

---

## 4. Deliberately not doing yet

- **Accounts and sync.** Every account is a copy of the reader's data we did not
  previously hold. If sync becomes necessary, it must be end-to-end encrypted
  under a key the reader holds — anything less spends the moat.
- **A tax pack for KRA reporting.** Genuinely the strongest retail
  willingness-to-pay, and the engine already computes every figure it needs
  (gross coupon, WHT withheld, net received, exempt IFB income). Held back only
  because M1's testing gap should close first: a document someone files with a
  revenue authority is the last place to discover a rendering bug.
