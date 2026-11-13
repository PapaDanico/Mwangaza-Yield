# Financial-engine research and release audit — 13 November 2026

**Status:** Engineering review, not a production release or a certification of CBK-equivalent settlement prices.

## Authoritative sources checked

1. Central Bank of Kenya, Treasury Bonds investor guide: https://www.centralbank.go.ke/securities/treasury-bonds/ — coupon payments are normally semiannual; individual prospectuses specify maturity, withholding tax and amortisation terms. CBK explicitly notes that amortisation reduces subsequent coupon payments.
2. CBK, Treasury Bond results, prospectuses and calculators: https://www.centralbank.go.ke/bills-bonds/treasury-bonds/ — the CBK calculator is guidance; CBK determines final auction pricing.
3. CBK, August 2026 reopening prospectus for IFB1/2019/016, IFB1/2021/018, IFB1/2021/021: https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/618766331_AUGUST%202026%20IFB1-2019-016%2C%20IFB1-2021-018%20AND%20IFB1-2021-021%20DATED%20%2017-08-2026--.pdf — explicitly records 50% amortisation dates (14 Oct 2030, 1 Apr 2030, 1 Sep 2031 respectively), plus tax exemption. This is evidence that amortisation must be **issue-specific**, not inferred from an issue code or tenor.
4. CBK, September 2026 FXD3/2019/015 and SDB1/2011/030 prospectus: https://www.centralbank.go.ke/uploads/treasury_bonds_prospectuses/431681232_SEPTEMBER%202026%20FXD3-2019-015%20AND%20SDB1-2011-030%20DATED%20%2007-09-2026.pdf — both report 10% WHT, demonstrating that tax treatment should be verified against the particular security prospectus.
5. CBK government securities FAQ: https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf — historical explanation of bond withholding and infrastructure exemptions; consult current prospectus and law for each security.
6. Kenya Revenue Authority, withholding tax guidance: https://www.kra.go.ke/individual/filing-paying/types-of-taxes/individual-withholding-tax — rate varies by income classification and residency; avoid describing one tax rate as universal.

## Confirmed engineering changes on PR #433

- Treasury-bill rollover: no phantom maturity when the selected horizon is shorter than the bill tenor.
- Bond-sale replacement screening: nonpositive or nonfinite quotations excluded.
- Calendar exports: same-day distinct coupon events no longer share identifiers merely because their titles match.
- Bond-sale cash flows: off-cycle amortisation principal is scheduled on its specified date rather than silently delayed to the next coupon.
- Amortisation validation: invalid dates, invalid fractions and cumulative repayment greater than 100% rejected.
- **Build-blocking defect found during this audit:** earlier rollover patch accidentally embedded literal backslash-n sequences in TypeScript code. Repaired in commit c4f5232. Prior assertions that the branch was ready for compilation would have been unjustified.

## Open financial-model risks — do not silently assume these are resolved

**P0 — Verify against the exact prospectus:** The generic bond pricing engine assumes 182-day coupon periods and bullet principal. It does not incorporate issue-specific amortisation when computing a bond purchase YTM. A bond with a partial redemption cannot be accurately valued by simply applying the generic bullet model. Show an explicit limitation or supply a verified issue-level schedule before presenting a price as actionable.

**P0 — Coupon accrual across off-cycle amortisation:** The sale calculator currently applies the balance outstanding immediately before each coupon date to an entire coupon period. If principal is repaid between coupon dates, that is not necessarily the contractual accrued-interest convention. Obtain the relevant prospectus/CBK cash-flow schedule before implementing prorated coupons or assuming full-period reduced coupons.

**P1 — Existing historical broker fixture:** tests/unit/sell.test.ts checks an actual quoted IFB1/2022/18 transaction with 50% amortisation on 2 June 2031. This is a valuable independent cross-check; preserve it while adding issuer-specific reference cases.

**P1 — Yield solver bounds:** src/lib/sell.ts currently bisects gross yields only from 0.0001% to 200%. Deep premium bonds with negative YTM and very short-maturity instruments can hit a bound. Do not present a bound as an observed yield; explicitly label solver limits and consider bounded/no-solution results.

**P1 — Data provenance:** The CBK bond results and prospectus listing is an ongoing feed, not proof that every issue in public/data/bonds.json has current, verified maturity and amortisation metadata. Audit by ISIN against primary documents and store provenance per issue.

**P1 — Taxes:** Do not apply a single replacement-bond withholding rate to all securities. The model's 10%/15% convention needs issue and investor eligibility verification; distinguish coupons, discount gains and investor-specific treatment.

## Release gate

1. Run `npm ci`, `npm run typecheck`, `npm run test`, `npm run build` on the remediation branch. **Not yet completed** because hosted CI jobs have failed to start.
2. Verify existing broker-sheet regression fixture, the new amortisation tests, the T-bill horizon tests and calendar UID tests.
3. Reconcile source-derived issue cash flows against prospectuses for at least one amortising IFB and one taxable FXD.
4. Confirm no new dependency on NSE-owned pricing data or unlicensed redistribution.
5. Merge PR #433 and perform **one consolidated deployment only after the gate passes**.

Research snapshot is dated 13 November 2026. Source documents and current tax law take precedence over app defaults.
