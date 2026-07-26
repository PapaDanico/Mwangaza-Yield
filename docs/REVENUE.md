# Making meaningful income from two free products

Written 2026-07-26, covering **both** Mwangaza Yield and JiPange. `BUSINESS-MODEL.md`
sets the strategy for this repo and rules two revenue lines out on principle;
this document is narrower and more uncomfortable: it asks what would actually
put money in the account, in what order, and what each path costs before it
pays anything.

Every figure below is either measured from the repositories or labelled as an
assumption with its arithmetic shown. Where a number would require a
counterparty conversation we have not had, it says so rather than guessing.

---

## 0. Where we actually stand

| | Mwangaza Yield | JiPange |
|---|---|---|
| Revenue today | **KES 0** | **KES 0** |
| Paying users | 0 | 0 |
| Monetisation code shipped | none | product directory, 14 entries |
| Affiliate arrangements signed | 0 | **0 of 14** (`isAffiliate: true` appears zero times in `lib/affiliate-links.ts`) |
| Traffic we can read | see §1 | see §1 |

JiPange's partner directory is the interesting line. The distribution surface
is built — vetted, regulated products, filtered, with a personalised
recommendation flowing into it from the journey funnel — and **not one of the
fourteen links earns anything.** The work of building the shelf is done; nobody
has been asked to pay for the shelf space.

That is the single largest gap between effort spent and money earned across
both products.

---

## 1. The constraint that gates almost everything: we cannot read our own traffic

Mwangaza's first-party counter is instrumented and writing (`src/lib/analytics.ts`
→ `netlify/functions/track.mts` → Netlify Blobs). Reads are gated on
`METRICS_TOKEN`, which **is not configured**, so the counters accumulate where
only the Blobs dashboard can see them.

This is not a tidiness problem. Three of the four revenue paths below require a
sentence of the form *"N Kenyans used this tool last month"*:

- A fund manager deciding what distribution is worth needs N.
- A pricing decision on a paid retail product needs N to size the market.
- A sponsor of any kind needs N, and needs it independently checkable.

Only engine licensing (§2) can be sold without it, because that sale rests on
correctness rather than reach.

**Cost to fix: one environment variable.** It is the highest
return-on-effort item in this entire document and it should be done before any
commercial conversation is opened.

---

## 2. Engine and data licensing — the only line that can be sold today

`BUSINESS-MODEL.md` §1 makes this case and M3 has shipped the packaging: a
versioned build with no React dependency, documented conventions, a smoke test
that proves the built artifact against a real broker contract note, and a
published rates feed with a reference integration we control on both ends.

**The sales conversation is one number**, and it is already measured: a wrong
day-count convention overstated `FXD2/2018/20` by KES 61,836 per million, with
a mean error of KES 7,923 per million across all 58 live bonds. A SACCO running
a KES 500M book on a spreadsheet with that convention error is mispricing by
roughly **KES 4 million**.

### What is missing is not code

`ENGINE-API.md` documents the maths. What does not exist:

1. **A price.** Nothing anywhere states what a licence costs. A prospect who
   has to ask does not ask.
2. **A spreadsheet-shaped delivery.** M3 flags this: the buyer's analyst lives
   in Excel, not in `npm install`. The rates feed is closer to real demand than
   the JS package is, and a CSV endpoint is closer still.
3. **A first reference customer**, most plausibly via DN Consultancy.

### Honest sizing

One SACCO pilot at even KES 150,000/year is more revenue than any realistic
retail path produces in year one, and it takes one conversation rather than ten
thousand users. This is the line to push, and it is uncomfortable precisely
because it depends on relationships rather than on code we can write.

---

## 3. The KRA tax pack — the strongest retail willingness-to-pay

`BUSINESS-MODEL.md` §4 already names this as *"genuinely the strongest retail
willingness-to-pay"* and defers it on one stated condition: that M1's testing
gap should close first, because *"a document someone files with a revenue
authority is the last place to discover a rendering bug."*

**That condition has substantially cleared.** Browser tests now run in CI, the
print sheets are driven end to end, and the engine already computes every input
a return needs — gross coupon, WHT withheld, net received, and exempt IFB
income separately. The remaining M1 item is `npm run lint` in CI, which is
hygiene rather than a correctness gate.

### The arithmetic of a paid retail product in Kenya

This is where optimism usually dies, so do the sum first. At a one-off KES 800
per filing season, net of payment-processor fees of roughly 3%:

| Paying users | Gross | Net |
|---|---|---|
| 100 | 80,000 | ~77,600 |
| 500 | 400,000 | ~388,000 |
| 2,000 | 1,600,000 | ~1,552,000 |

Two thousand paying users is a large number for a Kenyan retail finance PWA.
Five hundred is plausible with a real audience behind it. **This is a
meaningful second income line, not a first one** — and the conversion rate it
implies is exactly why §1 has to be fixed before anyone commits to building it.

### The design constraint it must not break

The app's promise is that data never leaves the device. A tax pack must be
generated **on the device**, from data the reader already holds, and paid for
by unlocking the export rather than by uploading anything. Anything that routes
a user's holdings through a server to produce a PDF spends the moat to save
engineering effort, and the moat is worth more.

---

## 4. Affiliate income — viable only if restructured

`BUSINESS-MODEL.md` rules out **broker/CDS referral fees** and it is right to:
once paid per referral, every "best yield" tile is suspect, including the
honest ones.

JiPange's product directory is a different animal and deserves a different
answer, but only under a structure that survives the same test — *"who pays
you, and what do they want from me?"*

| Structure | Survives the test? |
|---|---|
| Per-click or per-signup commission | **No.** It pays more when the reader picks a particular product, which is exactly the incentive the directory exists to be free of. |
| Trail commission on assets introduced | **No**, and worse — it pays more the longer the reader stays in one product. |
| **Flat annual listing fee, identical for every listed product, disclosed on the page, with placement determined solely by published yield and regulator** | **Yes.** The provider pays for presence, not for outcomes; the ordering is a function of public data and cannot be bought. |

The last row is the only one to pursue. It is also the only one that a reader
can be told about in one honest sentence, which is the real test.

Sizing requires the traffic figure from §1 and a conversation with providers,
so no number is invented here. What can be said: fourteen regulated products
already sit on that page, the page already receives the journey funnel's
personalised recommendation, and **nobody has ever been asked**.

---

## 5. What is still ruled out, and stays ruled out

Unchanged from `BUSINESS-MODEL.md`, restated because they are the paths that
look easiest when income is wanted quickly:

- **Advertising.** Trades the only durable advantage for cents per thousand
  views on a retail Kenyan audience. The arithmetic does not work even if the
  principle did.
- **Per-referral broker fees.** The most lucrative-looking and the worst.
- **Selling, sharing or brokering user data.** Not a revenue line under
  consideration and never will be. It is the thing both products promise not to
  do.

---

## 6. Sequence

Ordered by *revenue per unit of effort and risk*, which is not the same as
ordered by size.

1. **Configure `METRICS_TOKEN`.** One environment variable. Unblocks §1 and
   therefore §3 and §4. Do this first regardless of everything else.
2. **Publish a price for the engine licence and a CSV delivery of the rates
   feed.** The buyer's analyst uses a spreadsheet. Both are small, and neither
   needs a counterparty's permission.
3. **Open one licensing conversation** via DN Consultancy. This is the only
   line that can close in the current quarter.
4. **Approach two or three listed providers** about a flat, disclosed listing
   fee — after step 1 gives a number to quote.
5. **Build the tax pack**, on-device, once steps 1–3 have shown whether the
   audience is there to sell it to.

**What this sequence refuses to do** is build a paid feature before knowing
whether anyone is there to buy it. The products are both good enough that the
temptation is to add a price tag and see. Every step above is either free or
tells us something before it costs anything, and that ordering is deliberate.

---

## 7. How to know this is working

Stated as exit tests, in the style `ROADMAP.md` uses, so that "we are making
progress on revenue" cannot be asserted without evidence:

- **§1 passes** when a monthly figure for tool usage can be produced from a
  command, not a dashboard screenshot.
- **§2 passes** when one organisation has paid for one licence.
- **§3 passes** when a reader has paid for one tax pack that they then
  successfully filed.
- **§4 passes** when one provider has paid a listing fee under a structure the
  About page can describe in one sentence without embarrassment.

None of these is passed today. That is the honest position, and writing it down
is the point of the document.
