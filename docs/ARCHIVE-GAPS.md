# The auction archive's remaining gaps, measured

**Evidence:** `validate-sources` run 30469802718 (2026-07-29), steps 12–13.
The job hit its 20-minute bound and was cancelled before steps 14–19, so this
covers the undated-dates and tap-sale probes only.

Written up rather than acted on, because re-deriving it costs a 20-minute CI
run that has already timed out once.

---

## 1. The 13 undated records: recoverable

The dates are in the documents, as a trailing line after the signatory block:

```
| John K. Birech
| Ag. Director, Financial Markets
| 27 April 2017          ← 1761396165_Tap sale advert.pdf
| 03 March 2017          ← 268834041_...IFB1-2017-12
| 28 September 2017      ← 230066781_SEPTEMBER 2017...
```

Some also carry `DATED 28/10/2013` in the title, and settlement dates in prose
("Settlement date for payments remains Tuesday, 2nd May, 2017"). The probe's
own note: `[auctionDate] not a parsed field (it is the date)`.

**A parser gap, not a data gap.** Feasible.

Consequence while unfixed: these records cannot be grouped into an auction, so
they are excluded from `subscription.ts` — correctly, but silently.

---

## 2. Tap sales: the schema is wrong, not the parser

Every tap sale is missing the same three fields — `marketWeightedAverageRate`,
`amountOfferedKESM`, `bidsReceivedKESM`. **They are not in the documents, and
should not be.** A tap sale reports only:

```
| Total bids Accepted at Face Value (Kshs. M)
| Total bids Accepted at Cost (Kshs. M)
| Total Number of Accepted Bids
| Allocated average rate for accepted bids (%)
| Adjusted Average Price(Per Kes 100.00)
| Coupon Rate (%)
```

No amount offered and no market weighted average, because a tap sale is
first-come-first-served against a quantum — not a competitive auction with an
offer and a clearing distribution.

So "no tap sale has ever parsed completely" is measuring tap sales against a
competitive-auction schema. **The fix belongs in the completeness check, not
the parser.**

Two things follow:

- A tap sale can never yield a bid-to-cover ratio. `subscription.ts` is right
  to exclude them; that exclusion should be explicit rather than incidental.
- `archive-quality.ts` should score tap sales against their own field set, or
  the archive will report a permanent deficit it can never close.

---

## 3. Three genuinely fixable defects, found incidentally

| Defect | Evidence | Cost |
|---|---|---|
| **Doubled glyphs** | `FXD_1_2010_10.pdf` extracts as `CCoouuppoonn RRaattee ((%%)) 88..779900` — every character duplicated. Three records lack a coupon rate because of it. | Low; de-duplicate before matching |
| **Wording variant** | Some tap sales say `Total bids Received in Face Value (Kshs. M)` rather than `Total bids Received (Kshs. M)`. A real miss. | Low |
| **Malformed source figure** | `Total bids Accepted at Face Value (Kshs. M) 8.050.30` — two decimal points. The parser extracted nothing, which is the right refusal; worth recording as a source defect rather than a parser one. | None — behaving correctly |

---

## 4. One "defect" that is correct behaviour

`RE-OPENED FXD1-2022-03 & FXD1-2019-15 DATED 24-04-2023.pdf` is counted as a
multi-bond miss: the filename names two issues and the parser emitted one.

The document says: **"The auction for FXD 1/2019/15 was cancelled."**

One bond was auctioned, one record was written. Correct. It is currently
counted against the parser, which means the multi-bond failure rate is
overstated by at least this case — and nobody should tune a parser against a
number that includes it.

---

## Suggested scope, if this is picked up

One focused pass, in this order:

1. Recover `auctionDate` from the signature line and the `DATED` title.
2. Teach the completeness check that tap sales have their own field set.
3. Fix doubled-glyph extraction.
4. Stop counting cancelled bonds as multi-bond misses.

Steps 2 and 4 change what is *measured*, not what is parsed, and together they
probably account for more of the apparent gap than steps 1 and 3 do.
