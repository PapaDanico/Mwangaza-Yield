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

---

## Status, 2026-07-30 — closed

All four resolved, though not all four the way this note expected.

| Step | Outcome |
|---|---|
| 1. Undated records | **Declined on evidence.** See below. |
| 2. Tap-sale schema | **Done** — `TAP_SALE_FIELDS` in `archive-quality.ts`. |
| 3. Doubled glyphs | **Done** — `undouble_words` in `auction_results.py`. |
| 4. Cancelled bonds | **Already done** before this note was written. `auction_results.py` scores by bonds *priced* and by code density, and its own comment works through the FXD1/2019/15 case. Right about the defect, wrong about it being outstanding. |

### The prediction held

Scoring tap sales against their own field set takes complete records from
**336 to 347 of 387**. Sixty-eight documents had been measured against fields
their source cannot contain, and no amount of parser work would ever have
closed that.

The eleven records are not really the point. The remaining forty are now a
list of real defects rather than a mixture of defects and category errors, so
the number is worth tuning against for the first time. Per-field coverage is
scored the same way — each field against the records that *could* carry it,
because counting a tap sale as missing "amount offered" dragged that field
down with documents that were never going to state it.

### Step 1 was wrong, and this is the correction

This note called the undated records "a parser gap, not a data gap" and said
the dates were recoverable from the signature line. The date is certainly
there. It is a **different date**, and writing it into `auctionDate` would be
worse than leaving the field empty.

`auctionDate` holds the VALUE date — the Monday the bond is dated from, which
is why 297 of 303 dated records fall on a Monday. The signature line holds the
day the release was signed:

```
results dated 03/08/2026 (Mon)   signed July 30, 2026 (Thu)   -4 days
results dated 27/07/2026 (Mon)   signed 22 July 2026  (Wed)   -5 days
switch  dated 15/07/2026 (Wed)   signed 13 July 2026  (Mon)   -2 days
```

The gap is real, it varies, and nothing in the document announces it. Filling
the field this way would put thirteen publication dates into a column of value
dates on no stated basis, and every consumer that groups by date — the year
tables, the auction grouping in `subscription.ts`, the Monday check in
`archive-quality.ts` — would read them as though they meant the same thing.

A visibly missing date is a known unknown. A plausible wrong one is not. The
thirteen stay undated unless someone adds a separate field with its own name
and meaning; the reasoning sits in `auction_date_from_lines`, where the next
person will come to add it, and the three measurements are locked in a test so
nobody re-derives them before declining it again.
