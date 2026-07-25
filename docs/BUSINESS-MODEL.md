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
  licensed redistribution of NSE-derived data (we hold no such licence).

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
- [ ] **Browser tests in CI.** Three of the four defects fixed this week were
      invisible to 382 unit tests: a dead feature, an unguarded yield, and copy
      contradicting the data. The unit suite is structurally blind to "renders
      wrongly" and "renders nothing". This is the highest-value engineering item
      outstanding.
- [ ] `npm run lint` runnable in CI (`next lint` currently prompts
      interactively, which is why the workflow omits it).

### M2 — The auction bid assistant

A retail bidder can answer *"what should I bid?"* with evidence.

- [ ] Reuse `auction-review.ts` grouping — never per-record bid-to-cover.
- [ ] Show, for the tenor being bid: accepted-rate range, weighted average, and
      where the bidder's intended rate falls against recent history.
- [ ] Restrict headline claims to 2022+; label older context as context.
- [ ] Surface archive gaps via `archive-quality.ts` rather than papering over.
- [ ] Tests pinning the grouping, so a future refactor cannot silently
      reintroduce the 0.61x artefact.

**Exit test:** for the next live auction, the assistant's stated range contains
the actual weighted average rate. Record the prediction *before* the result
publishes — a claim checked after the fact is not a test.

### M3 — Licensable engine

An institution can buy and integrate the maths.

- [ ] Engine extracted as a versioned package, no React/DOM dependency.
- [ ] Conventions documented with their evidence, auditable by a third party.
- [ ] Reference integration (a spreadsheet-shaped API is likely the real
      demand, not a JS import).
- [ ] Licence terms that keep NSE-derived data out of scope.

**Exit test:** one paying pilot, most plausibly via DN Consultancy.

### M4 — Depends on others, so it is scheduled last

- [ ] Written NSE permission (`ROADMAP.md` §3 option b). Worth asking *now*
      that the product visibly declines to republish their data and routes
      readers to their own site — a materially better opening position than
      requesting a licence to resell.
- [ ] Richer auction radar — gated on CBK publishing, not on code.

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
