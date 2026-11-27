# Kenyan Treasury bond pricing and cash-flow conventions (CBK and NSE), as of November 2026

Method note. CBK prospectus PDFs on `centralbank.go.ke` could not be reached by `curl` from this session, but the WebFetch tool did retrieve them (it fetches server-side). Their text was extracted with `pypdf`. Each convention below was then **tested numerically** in a standalone Python script against CBK's own printed figures (pricing tables, accrued interest, worked examples) and against NSE's published trade sheet. A "reproduced" finding means an independent computation matched the printed number to 4 decimal places. It is not an interpretation of wording. Where something is inferred, the text says so.

Primary documents read in full (text extracted):
- CBK, *Prospectus for re-opened 16, 18 and 21-year infrastructure bonds* (IFB1/2019/016, IFB1/2021/018, IFB1/2021/021), settlement 17 Aug 2026, PDF created 30 Jul 2026. [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf)
- CBK, *Prospectus for re-opened 15 and 19-year infrastructure bonds* (IFB1/2018/015, IFB1/2022/019), settlement 18 Aug 2025. [CBK Aug 2025 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/654434758_AUGUST%202025%20IFB1-2018-15%20AND%20IFB1-2022-019%20DATED%20%2018-08-2025.pdf)
- CBK, *Prospectus for re-opened IFB1/2023/6.5 and IFB1/2023/17*, settlement 19 Aug 2024. [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf)
- CBK, *Frequently Asked Questions on GoK Securities*. The PDF metadata says it was created 7 July 2014, so it is **historical**: amounts in it are superseded where newer prospectuses differ. [CBK FAQ](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf)
- CBK, *Operational Procedures & Guidelines: Automated Clearing and Settlement for GoK Treasury Bonds*, July 2023. [CBK settlement guidelines](https://www.centralbank.go.ke/wp-content/uploads/2023/07/Operational-Guidelines-for-Automated-Clearing-and-Settlement-for-Government-of-Kenya-Treasury-Bonds-July-2023.pdf)
- NSE, *The NSE Yield Curve and Implied Yields Generation Methodology 2024* (PDF created 6 Aug 2024). [NSE methodology](https://www.nse.co.ke/wp-content/uploads/NSE-Implied-Yields-Yield-Curve-Generation-Methodology-1.pdf)
- NSE, *Operational Guidelines for the Bond Quotations Board*, March 2024. [NSE quotations board guidelines](https://www.nse.co.ke/wp-content/uploads/NSE-OPERATIONAL-GUIDELINES-FOR-THE-BOND-QUOTATIONS-BOARD.pdf)
- NSE, daily bond price sheet, 5 February 2026. [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)

Licensing caution, from the repository itself, not from these sources: per `CLAUDE.md` and `docs/FINANCIAL-ENGINE-AUDIT-2026-11-13.md`, NSE-owned pricing data is not to be redistributed. The NSE sheet was used here **only as an independent check of the formula**, not as data to ship.

---

## 1. CBK bond pricing formula: price per 100 from yield, day count, frequency, clean vs dirty

### Takeaway
CBK prices a Treasury bond as the present value of its remaining cash flows, discounted at half the quoted annual yield per 182-day period. The exponent is (days from settlement to the cash flow) / 182. Accrued interest is coupon × days since the last coupon / 364. CBK's pricing table prints the **clean** price per 100. The amount paid is the **dirty** price (clean + accrued interest), and CBK says so in a worked example in every prospectus. The formula reproduced every CBK-printed figure tested, to 4 decimals, across 7 bonds and 3 prospectuses (2024-2026), including the amortising ones.

### Cited Findings
- **Formula (CBK's own statement).** CBK's FAQ gives P = I/(1+r)^1 + I/(1+r)^2 + … + (I+F)/(1+r)^n. Here P is the price per 100, I is the semi-annual coupon, F = 100 and r is the quoted yield divided by 2. It also says: *"The Day Count Convention for pricing Treasury bonds in Kenya is 364 days."* — [CBK FAQ (2014)](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf)
- **Fractional first period (CBK's worked example).** The FAQ's re-opening example for FXD2/2009/2 (coupon 8.75%, re-opened 29/06/2009, next coupon 23/11/2009) uses k = 147/182 = 0.8077 and gives AI = KSh 0.841. Clean P = 97.630 and dirty D = 98.471. The text says that off a coupon date *"the settlement price is the dirty price which includes accrued interest."* Check: 8.75 × 35/364 = 0.8413, whereas the /365 result would be 0.839. — [CBK FAQ (2014)](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf)
- **Clean table, dirty settlement (current prospectuses).** Each prospectus prints "YIELD(YTM) / CLEAN PRICE" tables and an "IMPORTANT INFORMATION" box. Example for IFB1/2021/021: *"The bond attracts Accrued Interest (AI) of KES 5.6337 per KES 100 … If quoted yield is 12.7370% dirty price is the clean price (KES 99.9797) plus AI (KES 5.6337) which equals KES 105.6134."* — [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf)
- **Accrued interest reproduced as coupon × days/364.** In each case below the day count is a whole number of days, and /365 does not reproduce the printed figure:
  - IFB1/2019/016: 11.75 × 119/364 = **3.8413** (CBK 3.8413).
  - IFB1/2021/018: 12.667 × 133/364 = **4.6283** (CBK 4.6283).
  - IFB1/2021/021: 12.737 × 161/364 = **5.6337** (CBK 5.6337). All at settlement 17 Aug 2026. — [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf)
  - IFB1/2018/015: 12.5 × 28/364 = **0.9615** (CBK 0.9615).
  - IFB1/2022/019 settled on a coupon date and carries *"zero Accrued Interest"*. — [CBK Aug 2025 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/654434758_AUGUST%202025%20IFB1-2018-15%20AND%20IFB1-2022-019%20DATED%20%2018-08-2025.pdf)
  - IFB1/2023/6.5: 17.9327 × 98/364 = **4.8280**.
  - IFB1/2023/17: 14.399 × 161/364 = **6.3688** (both as printed). — [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf)
  - FXD bonds, using AI figures from search snippets of the prospectuses: July 2026 AI **2.8846** = FXD1/2026/030, 12.5 × 84/364 (issue 20 Apr 2026 to 13 Jul 2026). — [CBK Jul 2026 prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/46801342_JULY%202026%20FXD1-2022-010,%20FXD1-2021-020%20AND%20FXD1-2026-030%20DATED%20%2013-07-2026.pdf)
  - September 2026 AI **5.9414** = FXD1/2019/020, 12.873 × 168/364. — [CBK Sep 2026 prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/1011091044_SEPTEMBER%202026%20FXD1-2019-020%20AND%20FXD1-2026-030%20DATED%20%2021-09-2026%20REV.pdf). These two were matched to a bond by arithmetic; the snippet did not say which bond each AI belongs to.
- **Prices reproduced.** The engine gave dirty = Σ CF/(1 + y/200)^(days/182) and clean = dirty − AI. This matched, for example:
  - FXD4/2019/010 at 12.28% on 11 Nov 2026: clean **99.9951**, AI **5.9713**, dirty **105.9664**. These are CBK's worked example in the November 2026 switch prospectus; the figures are taken from the repository's pinned test, not fetched again here. — [CBK Nov 2026 switch prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/1533456351_NOVEMBER%202026%20SWITCH%20FROM%20FXD1-2023-005,%202696-091,%202657-182,%202585-364%20TO%20FXD4-2019-010%20DATED%2011-11-2026%20REVISED.pdf)
  - Every tested row of the 2024, 2025 and 2026 IFB pricing tables. These matched only with amortisation applied; see §3.
- **Coupon dates are a 182-day grid, so not "same calendar day each half-year".** CBK prints the dates. For IFB1/2021/021 they run *"7 Sept 2026, 8 Mar 2027, 6 Sept 2027, 6 Mar 2028 … 17 Feb 2042, 18 Aug 2042"*, every step exactly 182 days, ending on the maturity date. IFB1/2019/016 and IFB1/2021/018 follow the same pattern. — [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf)
- **Semi-annual coupons.** Most T-bonds are fixed-coupon with interest paid semi-annually. — [CBK Auction Rules and Guidelines (2024)](https://centralbank.go.ke/wp-content/uploads/2024/06/AuctionRulesGuidelines.pdf) (search summary; not opened)
- **Withholding tax basis.** *"The final settlement price payable by investors is the Dirty Price plus Withholding Tax. Note however that withholding tax is computed on the Clean Price."* — [CBK FAQ (2014)](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf). Current FXD prospectuses repeat *"Withholding Tax is computed on clean prices"*. — [CBK Oct 2024 prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/1459985891_OCTOBER%202024%20FXD1-202%20AND%20FXD1-2023-005%20DATED14.10.24.pdf) (search snippet)
- **T-bills use a different basis: 365, not 364.** The FAQ gives P = 100 / (1 + r·d/36500). Its example (KSh 12m, 91 days at 7.65%) gives **98.128**. 100/(1+0.0765×91/365) = 98.1284, while /364 would give 98.1234. — [CBK FAQ (2014)](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf). The repository's `src/lib/tbills.ts` already uses 365 for bills and pins three 2026 notices.

### Inferences
- The exact engine is: AI = c × (settlement − last coupon date) / 364; dirty = Σᵢ CFᵢ / (1 + y/200)^(dᵢ/182), where dᵢ is the actual days from settlement to cash flow i; clean = dirty − AI. Because coupon dates step exactly 182 days, a full period accrues exactly c/2. The /364 accrual and the /182 discount exponent are therefore one consistent convention, not two choices.
- The schedule should be built from CBK's printed coupon-date list, or by stepping 182 days back from maturity. Calendar months must not be used. In every case tested, the 182-day grid from maturity reproduced CBK's printed dates.
- "Price per 100" in a **pricing table** is clean. "Price per 100" in a **switch** prospectus (the price CBK pays for the source bond) is dirty. The repository's `switch.ts` verified this: 115.8913 reproduces the quoted 9.9627% only when read as dirty. So "price per 100" is not one convention; read which table it comes from.
- The yield is a nominal annual rate compounded semi-annually (r = y/2 per 182 days). It is not an effective annual rate.

### Gaps
- No current (2025-2026) CBK document restating the bond formula was found; the FAQ is 2014. The current prospectuses carry tables and examples but no formula. The formula is established here by reproduction, not by a current written statement.
- It is unconfirmed whether CBK adjusts a cash flow falling on a weekend or holiday. All observed dates are Mondays, so the issue never arose.
- The current CBK bond calculator page was not reached.

---

## 2. Accrued interest, settlement lag and yield on the NSE secondary market

### Takeaway
NSE trades in Government bonds are reported as yield, clean price and dirty price per 100. The published dirty prices reproduce CBK's formula exactly, with accrual and discounting **from the trade date**. Settlement is DvP at CBK (KEPSS/CSD), on a value date the counterparties choose between T+0 and T+3; T+3 is the maximum. The register closes two working days before a coupon or redemption, and bonds cannot trade in the last three working days before principal redemption.

### Cited Findings
- **Settlement cycle.** *"The parties to the transaction may choose to settle the trades on T, T+1, T+2 or T+3. Settlement of a trade will be as per the value date traded in the ATS"*, and *"Currently, the Settlement cycle for Fixed Income Securities as per the NSE Trading Rules is T+0, T+1, T+2 or T+3."* — [CBK settlement guidelines (Jul 2023)](https://www.centralbank.go.ke/wp-content/uploads/2023/07/Operational-Guidelines-for-Automated-Clearing-and-Settlement-for-Government-of-Kenya-Treasury-Bonds-July-2023.pdf)
- Clearstream's market page (updated 25 Jun 2026) says: *"all trades on fixed income securities issued by the Government require to be settled on a T+3 basis"*, with T+0 to T+3 agreeable. It also says trading runs 9:00 am to 3:00 pm EAT, and that government securities *"shall not be traded within the last 3 working days prior to principal redemption."* — [Clearstream, Kenya securities trading](https://www.clearstream.com/clearstream-en/res-library/market-coverage/securities-trading-kenya-5116314)
- **Definitions and what a trade carries.** Clean price is the *"Price of a Treasury bond without accrued interest"* and dirty price the *"Price of a Treasury bond with accrued interest"*. On execution the ATS sends CSD the *"Quantity, Clean Price, Dirty Price and Yield Traded"*. Trading units are *"in multiples of 50,000"*. — [CBK settlement guidelines (Jul 2023)](https://www.centralbank.go.ke/wp-content/uploads/2023/07/Operational-Guidelines-for-Automated-Clearing-and-Settlement-for-Government-of-Kenya-Treasury-Bonds-July-2023.pdf)
- **Register closure.** *"The register for Treasury bonds closes two (2) working days to due date."* Coupons and redemptions go to holders on the register at closure. A pledged security's coupon goes to the pledgee, taxed *"based on the taxation scheme of the pledgee and NOT of the pledger."* — [CBK settlement guidelines (Jul 2023)](https://www.centralbank.go.ke/wp-content/uploads/2023/07/Operational-Guidelines-for-Automated-Clearing-and-Settlement-for-Government-of-Kenya-Treasury-Bonds-July-2023.pdf)
- **NSE dirty prices reproduce the CBK formula at the trade date.** All the rows below are from the 5 Feb 2026 sheet. Each matched CBK's formula with valuation on 5 Feb 2026 (trade date) to 4 decimals. Valuing at 6 Feb (T+1) or 9 Feb (T+3) did not match.
  - FXD1/2012/20 at 12.38%: dirty 101.1163, AI 2.8681.
  - FXD2/2019/15 at 12.65%: 103.6621.
  - FXD1/2020/15 at 12.60%: 106.8087.
  - FXD1/2022/25 at 13.70%: 107.5141.
  - Amortising IFB1/2022/019 at 12.50%: 108.6035, AI 6.0907.
  - Amortising IFB1/2023/017 at 12.7066%: 115.2652.
  - Amortising IFB1/2018/015 at 10.571%: dirty 107.5000, AI 0.5838.
  — [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)
- One anomaly in that sheet: an IFB1/2018/015 trade at 12.4902% shows a dirty price matching 5 Feb (100.6014) but an AI of 0.6181, which is the 6 Feb accrual. Its clean price (99.9833) is therefore 0.0343 below CBK-consistent. Treat the sheet's clean column as derived and occasionally inconsistent. — [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)
- **Sheet columns.** Issue No., ISIN, Issue Date, Maturity Date, Days to Maturity, Outstanding Value (millions), Coupon Rate, Traded Yield (%), Dirty Price, Clean Price, Previous Price, Total Value Traded (KSh). The sheet separates "fixed rate Treasury bonds above KES 50 million" from smaller trades. — [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)
- **How NSE's implied yields are made.** The implied-yield report lists for each bond the *"last and next coupon payment dates … coupon rate, implied yield, clean and dirty prices and accrued Interest"*. Yields are built from primary auction YTMs (given priority), then volume-weighted traded yields from trades of *"50Million and above face value excluding Sale Buy Back Transactions"*, then dealer two-way quotes (*"within a spread of 100 basis points"* and within ±100bp of the previous day's yield). Non-benchmark FXDs are log-linearly interpolated. *"IFBs YTM are not factored during yield curve generation."* — [NSE methodology (2024)](https://www.nse.co.ke/wp-content/uploads/NSE-Implied-Yields-Yield-Curve-Generation-Methodology-1.pdf); [NSE quotations board guidelines (Mar 2024)](https://www.nse.co.ke/wp-content/uploads/NSE-OPERATIONAL-GUIDELINES-FOR-THE-BOND-QUOTATIONS-BOARD.pdf)
- **Quotes are in yield.** Participants enter *"two-way quotes (Buy yield & Sell yield)"*, and the volume defaults to KES 50M. — [NSE quotations board guidelines (Mar 2024)](https://www.nse.co.ke/wp-content/uploads/NSE-OPERATIONAL-GUIDELINES-FOR-THE-BOND-QUOTATIONS-BOARD.pdf)
- A settlement period of three days was reported in Kenyan press, undated in the search result. — [Standard, "Bond settlement period reduced to three days"](https://www.standardmedia.co.ke/cartoon/article/2000015250/bond-settlement-period-reduced-to-three-days) (search result only; not opened)

### Inferences
- The NSE sheet's yield/price pairs are computed as of the **trade date**, not the value date. For a T+3 trade the cash that actually moves would be priced at the value date, and the AI at value date would be about 3 days × c/364 higher. Inferred from the reproduction; not stated by NSE. The parties agree a settlement amount, which CBK's guidelines carry as "Net settlement amount" and "Settlement /value date". For a reader-facing engine, accrue to the value date the user enters, and note that NSE's printed dirty price corresponds to T+0.
- The two-working-day register closure means a bond bought in that window settles without the next coupon. No source found states whether NSE or CBK then uses ex-coupon (negative) accrued interest. Most likely trading is simply blocked or the coupon is claimed back, but that is unconfirmed.

### Gaps
- The *NSE Fixed Income Trading Rules, 2024* (cited by the NSE guidelines) were not retrieved. They would settle ex-coupon handling, the official settlement default and trading-hours rules.
- No explicit NSE statement of the day-count was found. It is established only by reproduction (/364 with /182 exponent).

---

## 3. Amortising IFBs: schedule expression, coupon basis after a partial redemption

### Takeaway
CBK states amortisation in each prospectus as dated percentages *"of unencumbered outstanding principal amount"*. The percentage applies to the **balance outstanding at that date, not the original face**. Coupons after a redemption are paid on the reduced balance. Prices are quoted per 100 of **currently outstanding** face. These three rules reproduce every CBK pricing-table row tested across six amortising bonds, to 4 decimals. A bullet model misprices the same rows by up to 3.2 points per 100.

### Cited Findings
- **How the schedule is written (2026).** The terms table has an "AMORTIZATION DATES/STRUCTURE" row: IFB1/2019/016 *"14-Oct-2030 (50%)"*; IFB1/2021/018 *"01-Apr-2030 (50%)"*; IFB1/2021/021 *"01-Sep-2031 (50%)"*. Maturities are 08-Oct-2035, 21-Mar-2039 and 18-Aug-2042. Coupons are 11.7500, 12.6670 and 12.7370; WHT is N/A. — [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf)
- **How the schedule is written (2025).** IFB1/2018/015: *"17/01/2028 - 40% of unencumbered outstanding principal amount. 10/01/2033 - 100% - Final Redemption of all outstanding amounts. Any amounts up to Kshs 1.0 million per CSD account at amortization will be redeemed in full."* IFB1/2022/019: *"09/02/2032 - 50% unencumbered outstanding principal amount. 28/01/2041 - 100% - Final Redemption"*, with the same KSh 1.0 million clause. — [CBK Aug 2025 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/654434758_AUGUST%202025%20IFB1-2018-15%20AND%20IFB1-2022-019%20DATED%20%2018-08-2025.pdf)
- **How the schedule is written (2024).** IFB1/2023/6.5: *"10 May 2027-50% amortization on outstanding principal amount, 7th May 2029-30% of unencumbered outstanding principal amounts and 6th May 2030-100%."* IFB1/2023/17: *"28th February, 2033-50% of unencumbered outstanding pricipal amount, 20th February,2040-100% final redemption."* — [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf)
- **Test: the fraction is of the OUTSTANDING balance.** IFB1/2023/6.5 at 17.00% prints clean **102.5044**. Reading 30% as 30% of the remaining 50 (= 15 per 100 original) gives **102.5044**. Reading it as 30 per 100 original gives 102.4471, and a bullet model gives 103.2417. At 18.50%, CBK prints 98.3691; outstanding-basis gives 98.3691, original-basis 98.4014. Computed against [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf)
- **Test: coupons after redemption are on the reduced balance.** In the three tables below, the amortised model reproduces CBK to 4 decimals and a bullet model misses.

  IFB1/2019/016, 17 Aug 2026:

  | Yield | CBK clean | Amortised model | Bullet model |
  |---|---|---|---|
  | 11.00% | 103.3254 | 103.3253 | 104.2293 |
  | 14.50% | 88.9009 | 88.9009 | 86.2394 |

  IFB1/2021/018, 17 Aug 2026:

  | Yield | CBK clean | Amortised model | Bullet model |
  |---|---|---|---|
  | 11.00% | 108.0281 | 108.0281 | 111.2039 |
  | 14.50% | 92.1930 | 92.1930 | 89.4709 |

  IFB1/2021/021, 17 Aug 2026:

  | Yield | CBK clean | Amortised model | Bullet model |
  |---|---|---|---|
  | 11.00% | 109.7650 | 109.7651 | 112.9443 |
  | 13.00% | 98.6251 | 98.6251 | 98.2240 |
  | 14.50% | 91.4554 | 91.4554 | 89.1027 |

  Computed against [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf)

  Also matched:
  - IFB1/2022/019 at 11.00%: 111.7119 vs 111.7119 (bullet 114.4663).
  - IFB1/2018/015 at 14.50%: 93.0366 vs 93.0366 (bullet 91.0582). — [CBK Aug 2025 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/654434758_AUGUST%202025%20IFB1-2018-15%20AND%20IFB1-2022-019%20DATED%20%2018-08-2025.pdf)
  - IFB1/2023/17 at 15.00%: 96.7586 vs 96.7586 (bullet 96.3887). — [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf)
- **Test: prices are per 100 of current outstanding.** IFB1/2018/015 had already passed earlier amortisation dates by 2025. Its 2025 table reproduces only when the 40% step is applied to a balance normalised to 100 at settlement. The NSE sheet lists its "Outstanding Value" as 398,452.21m and its 5 Feb 2026 trades reproduce on the same per-100-outstanding basis. — [CBK Aug 2025 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/654434758_AUGUST%202025%20IFB1-2018-15%20AND%20IFB1-2022-019%20DATED%20%2018-08-2025.pdf); [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)
- **The NSE market applies amortisation too.** IFB1/2022/019 and IFB1/2023/017 trades on 5 Feb 2026 reproduce only with their 50% steps (see §2). — [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)
- **Pledges at amortisation.** *"A pledge not cancelled at least five days before the securities amortization/ maturity date will result in amortized/matured securities automatically settling to the lender's account."* — [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf). The 2024 wording: *"the amortized bond principal and respective coupon payment, and the balance portion of the bond principal after amortization will be released to the lender."* — [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf)
- **Maturity-date conflict resolved for IFB1/2023/17.** A 2024 results notice listed "Due Dates 06/05/2030 21/02/2039" (search snippet). — [CBK results Aug 2024](https://centralbank.go.ke//uploads/historical_treasury_bond_results/107706422_RESULTS%20FOR%20REOPENED%20IFB1-2023-6.5%20AND%20IFB1-2023-17%20DATED%2019-08-2024.pdf). But the prospectus's coupon-date list ends at *"20/02/2040"*, its redemption line says *"20th February,2040-100% final redemption"*, and the NSE sheet gives maturity 20-Feb-40. 21/02/2039 appears in the prospectus as an ordinary coupon date. So 20 Feb 2040 is right, and it matches `bonds.json`. — [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf); [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)

### Inferences
- Engine rule: hold the balance B (per 100 of outstanding at settlement). On each coupon date pay c/2 × B/100, using the balance before any redemption that day. On an amortisation date pay f × B and set B ← B(1 − f), where f is the printed fraction of outstanding. At maturity pay the whole remaining B. In the repository, `buildCashflows` in `src/lib/sell.ts` already takes `fraction` steps. Check whether its fractions are interpreted against original face (`s.fraction * faceValueKES`) or outstanding. The code reads as **fraction of original face**, which matches CBK only while there is a single step. It is wrong for multi-step bonds such as IFB1/2023/6.5 (30% of outstanding after a 50% step) and for bonds already partly amortised at settlement unless the face is re-based.
- The **KSh 1.0 million clause** makes cash flows **holder-specific**: a CSD holding of KSh 1m or less is redeemed in full at the first amortisation date. The clause appears in the 2025 IFB prospectus; it was not found in the extracted text of the 2024 or 2026 prospectuses. A retail-sized holding of IFB1/2018/015 or IFB1/2022/019 would then behave as a bond maturing on the amortisation date. That changes its yield materially, and the pricing table does not reflect it. Inferred from the wording; CBK's handling of a holding just above KSh 1m (whether the remainder after amortisation can fall below 1m) is not stated.
- Amortisation fractions must come from the issue's own prospectus. CBK's schedules vary: 50/50, 40%-of-outstanding, and 50% then 30%-of-outstanding. They cannot be inferred from issue code or tenor, which the repository's 13 Nov audit also concluded.

### Gaps
- No found document gives the full amortisation history of older IFBs (e.g. IFB1/2018/015's pre-2025 steps). Re-opening prospectuses state only future steps. For holders who bought before an earlier step, the outstanding fraction needs either the original prospectus or the DhowCSD holding statement.
- Whether "unencumbered" means pledged holdings are amortised on a different basis was not settled. The pledge wording suggests the cash goes to the lender, not that the amount differs.

---

## 4. Off-cycle repayment: a redemption date between coupon dates

### Takeaway
Every amortisation date found in current CBK prospectuses falls **exactly on a coupon date** of the bond's 182-day grid. No CBK document examined specifies accrual for an off-cycle repayment, because CBK does not appear to schedule any. An engine can treat amortisation as on-cycle and flag any off-cycle date as an input error or an unverified case.

### Cited Findings
- On-cycle in every case checked:
  - IFB1/2019/016: 14 Oct 2030 is in its printed coupon list (*"15 Apr 2030 14 Oct 2030 14 Apr 2031"*).
  - IFB1/2021/018: 1 Apr 2030 is listed (*"1 Oct 2029 1 Apr 2030 30 Sept 2030"*).
  - IFB1/2021/021: 1 Sep 2031 is listed (*"3 Mar 2031 1 Sept 2031 1 Mar 2032"*). — [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf)
  - IFB1/2018/015: 17/01/2028 is listed. IFB1/2022/019: 09/02/2032 is listed. — [CBK Aug 2025 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/654434758_AUGUST%202025%20IFB1-2018-15%20AND%20IFB1-2022-019%20DATED%20%2018-08-2025.pdf)
  - IFB1/2023/6.5: 10/05/2027 and 07/05/2029 are listed. IFB1/2023/17: 28/02/2033 is listed. — [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf)
- The repository's own broker-quote fixture for IFB1/2022/018 (50% on 2 June 2031) is also on that bond's 182-day grid from its issue date of 13 Jun 2022. Computed here; see `tests/unit/sell.test.ts`.

### Inferences
- The "coupon accrual across off-cycle repayments" item in the repository's remaining-work list is probably moot for real CBK issues. Model amortisation as on-cycle and treat an off-cycle date as needing a prospectus citation. Reading a user's broker or DhowCSD date one day off (a calendar-month approximation) is a likelier source of an "off-cycle" date than CBK.

### Gaps
- No CBK statement covers what would happen off-cycle. Older pre-2018 IFBs were not checked.

---

## 5. Holder eligibility, bid limits, secondary trading, rediscounting

### Takeaway
For current (2024-2026) bond auctions, non-competitive bids are KSh 50,000 minimum and **KSh 50 million maximum** per CSD account per tenor. Competitive bids are **KSh 2 million minimum** per CSD account per tenor. Secondary trading is in multiples of KSh 50,000 from the settlement date. CBK rediscounts only as a last resort, at **3% above the higher of market yield or coupon**. The "KSh 20m non-competitive" and "KSh 100,000 minimum for IFBs" figures come from the 2014 FAQ and are superseded.

### Cited Findings
- **Bid limits (2026).** *"NON-COMPETITIVE BID AMOUNT Minimum KES. 50,000.00, Maximum KES. 50,000,000.00"*; *"COMPETITIVE BID AMOUNT Minimum 2 million per CSD account per Tenor"*. — [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf). The 2025 IFB prospectus has the same figures. — [CBK Aug 2025 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/654434758_AUGUST%202025%20IFB1-2018-15%20AND%20IFB1-2022-019%20DATED%20%2018-08-2025.pdf)
- **2024 wording.** *"Non-Competitive Bids: Maximum Kshs. 50 Million per CSD account per tenor. This does not apply to State corporations, public universities and Semi-Autonomous Government Agencies."* Also: *"Eligibility: Only investors with active CSD Accounts with the Central Bank of Kenya."*; *"Minimum Amount: Kshs. 50,000.00"*; *"Issuance method: Multi-Price Bid Auction"*; *"Classification: The bonds are non-benchmark Bonds."* Placing agents earn 0.15% commission. — [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf)
- **CBK Treasury bills page.** Minimum face value is *"Kshs. 50,000.00 for non-competitive bids and Kshs. 2,000,000.00 for competitive bids"*, in KSh 50,000 denominations. A 2025 bill notice caps non-competitive bids at KSh 50 million per investor account per tenor. — [CBK Treasury bills page](https://www.centralbank.go.ke/securities/treasury-bills/) (search summary)
- **Historical, superseded (2014).** Bills: *"minimum face value of Ksh.100, 000"*, and the maximum non-competitive amount was *"Ksh 20,000,000"* per CDS account per issue. Bonds: minimum KSh 50,000 in multiples of KSh 50,000, *"except for Infrastructure bonds whose minimum investible amount is Ksh 100,000."* Treasury bills *"are not traded at the Nairobi Securities Exchange"*; the 364-day is tradable OTC at CBK. — [CBK FAQ (2014)](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf)
- **Secondary trading.** *"Secondary trading in multiples of KES 50,000.00 commence on Monday, August 17, 2026"* (the settlement date). *"Listing: The bonds will be listed on the Nairobi Securities Exchange."* — [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf)
- **Rediscounting (2026).** *"The Central Bank will rediscount bonds as a last resort, at 3% above the prevailing market yield or coupon rate whichever is higher."* Instructions go through the DhowCSD portal/app (Instructions → Create new → Rediscount). — [CBK Aug 2026 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016,%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf). In 2024-2025 they went by email to [CBK rediscount desk address, as printed in the prospectus]. — [CBK Aug 2025 IFB prospectus](https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/654434758_AUGUST%202025%20IFB1-2018-15%20AND%20IFB1-2022-019%20DATED%20%2018-08-2025.pdf). For bills the FAQ formula used the tenor's weighted average rate plus 3%. — [CBK FAQ (2014)](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf)
- **Who may invest (2014 FAQ).** Resident or non-resident individuals and corporates with a local bank account, nominees, or a CBK CSD account. Non-Kenyans not domiciled in Kenya invest as nominees of a local commercial or investment bank. — [CBK FAQ (2014)](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf)
- **No IFB-specific secondary-trading restriction found.** The 2026 IFB prospectus permits trading in KSh 50,000 multiples from settlement, and IFBs trade on the NSE (the 5 Feb 2026 sheet shows IFB trades from KSh 350,000 to KSh 600m). — [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)
- **Tax (context only).** The IFB prospectuses say WHT is "N/A" and *"The bond does not attract withholding tax"*. In 2024 the wording was *"tax free as is the case for Infrastructure Bonds as provided for under the income tax act."* — [CBK Aug 2024 IFB prospectus](https://centralbank.go.ke/uploads/treasury_bonds_prospectuses/718912010_AUG%202024%20IFB1-2023-6.5%20AND%20IFB1-2023-017%20DATED%2019-AUG%202024.pdf)

### Inferences
- For a retail engine, the binding primary-market constraints are a KSh 50,000 minimum and multiples, and KSh 50m maximum non-competitive. A non-competitive bidder receives the weighted average rate. The 2014 FAQ says *"The successful weighted average rate derived from competitive bids is applied to all non-competitive bids"*, and CBK's auctions are multi-price.
- The cost of rediscounting can be modelled as selling at yield = max(market yield, coupon) + 3pp through the same price formula. Inferred: CBK states the rate, but not that the standard price formula applies to it.

### Gaps
- The CBK Treasury Bonds application form and the current Auction Rules and Guidelines (2024) were not read in full. Any 2026 change to limits would be there.
- No source found for a "KSh 20m non-competitive" limit for bonds in 2026. That figure is the 2014 bill limit.

---

## 6. Reconciling a broker's secondary quote with CBK pricing

### Takeaway
Kenyan brokers and the NSE quote **yield to maturity** on CBK's basis (semi-annual, 182-day periods, Actual/364 accrual). The NSE sheet carries both clean and dirty per 100. To reconcile a quote:
1. Take the quoted yield.
2. Price it with CBK's formula, applying the bond's amortisation schedule.
3. Accrue to the agreed value date.

The dirty result is the cash price per 100 of outstanding face. Broker commission and NSE or CDS fees sit outside the price: CBK's guidelines carry "Net settlement amount — commissions outside of this arrangement".

### Cited Findings
- The ATS reports *"Quantity, Clean Price, Dirty Price and Yield Traded"*, and the settlement amount is net with *"commissions outside of this arrangement."* — [CBK settlement guidelines (Jul 2023)](https://www.centralbank.go.ke/wp-content/uploads/2023/07/Operational-Guidelines-for-Automated-Clearing-and-Settlement-for-Government-of-Kenya-Treasury-Bonds-July-2023.pdf)
- Dealer quotes on the NSE Quotations Board are yields (buy yield and sell yield). — [NSE quotations board guidelines (Mar 2024)](https://www.nse.co.ke/wp-content/uploads/NSE-OPERATIONAL-GUIDELINES-FOR-THE-BOND-QUOTATIONS-BOARD.pdf)
- NSE trade yields convert to the sheet's dirty prices by CBK's formula at the trade date, with amortisation included (see §2 and §3). — [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)
- Tax-free IFBs trade at yields well below comparable FXDs (premium prices). Examples from the 5 Feb 2026 sheet:
  - IFB1/2023/7Yr (coupon 15.837) at 10.50-10.525%, dirty 114.87-114.94.
  - IFB1/2014/12Yr (coupon 11.0) at 8.75%, dirty 104.9357. — [NSE BondPrices 05-Feb-2026](https://www.nse.co.ke/wp-content/uploads/BondPrices_05-FEB-2026.pdf)
- A third-party tracker (Serrari, undated listing) shows IFBs quoted with yield, clean and dirty side by side; for example, IFB1/2021/021 last at 110.72 and 11.27% on 7 Oct 2026. Whether 110.72 is clean or dirty is not stated in the search result. — [Serrari IFB1/2021/021](https://serrarigroup.com/ke/bonds/ifb1-2021-021) (search summary; not verified)

### Inferences
- A broker "price" without a label should be tested both ways. Price the quoted yield and see whether the stated price equals the clean or the dirty result. A difference equal to the AI identifies the convention. A residual of about 3 days × c/364 suggests the broker valued at T+3 while the NSE sheet values at T+0.
- For an amortising IFB, a quote that reconciles only under a bullet model indicates the counterparty or tool ignored amortisation. CBK and the NSE both apply it, so CBK's own pricing is the reference.
- Commission is outside the price. For a quote that already includes commission, the effective purchase yield must be computed from the all-in cash, not the quoted yield.

### Gaps
- No 2026 broker research (Genghis, SIB, Kestrel, AIB-AXYS, NCBA) stating its quoting convention was found in readable form. An NCBA bidding guide (Mar 2025) was read but contains no pricing convention, only a "Minimum Bidding Amount KES 50,000.00", "Taxation 10.00%" for FXD1/2018/25 and a "Value Date". — [NCBA bidding guide, FXD1/2018/25 (Mar 2025)](https://ncbagroup.com/wp-content/uploads/sites/8/securepdfs/2025/03/Bond-Auction-Guide-March-2025-Re-opened-FXD1201825.pdf)
- NSE trading fees and broker commission scales (CMA-regulated) were not researched.
