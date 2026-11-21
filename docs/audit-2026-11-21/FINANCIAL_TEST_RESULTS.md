# Financial test results, 21 November 2026

Engine: `src/lib/financial-engine.ts` bundled with esbuild. Reference: a separate implementation written from first principles for this audit (182-day grid anchored on maturity, Act/364 periods, Newton solve on semi-annual yield). Real bonds from `bonds.json`, settlement 23 Nov 2026 (30-year on-coupon case 12 Oct 2026), 1,000,000 face, no charges.

| Case | Bond | Clean | Accrued (engine / ref) | Gross YTM % (engine / ref) | Net YTM % (engine / ref) | WHT | Result |
|---|---|---|---|---|---|---|---|
| Near-maturity, par | FXD1/2024/003 (0.13y) | 100 | 6.7177 / 6.7177 | 17.7775 / 17.7775 | 7.7365 / 7.7365 | 15% | match |
| Near-maturity, premium | FXD1/2024/003 | 104 | 6.7177 / 6.7177 | -10.0424 / -10.0424 | -18.8007 / -18.8007 | 15% | match |
| Tax-exempt, par | IFB1/2020/009 | 100 | 1.4606 / 1.4606 | 10.8362 / 10.8362 | 10.8362 / 10.8362 | 0% | match |
| Tax-exempt, discount | IFB1/2020/009 | 93 | 1.4606 / 1.4606 | 14.4285 / 14.4285 | 14.4285 / 14.4285 | 0% | match |
| Mid-life, premium | FXD2/2018/015 | 108 | 1.4712 / 1.4712 | 11.0535 / 11.0535 | 9.8144 / 9.8144 | 10% | match |
| Mid-life, par | FXD2/2018/015 | 100 | 1.4712 / 1.4712 | 12.7423 / 12.7423 | 11.4375 / 11.4375 | 10% | match |
| 30-year, discount | FXD1/2026/030 | 93.2777 | 1.2019 / 1.2019 | 13.4179 / 13.4179 | 12.0699 / 12.0699 | 10% | match |
| 30-year, 12 Oct | FXD1/2026/030 | 95 | 6.0096 / 6.0096 | 13.1733 / 13.1733 | 11.7860 / 11.7860 | 10% | match |

**T-bills (19 Nov auction, 365-day true-discount convention):** 91-day 8.7422% gives price 97.8669, gross EAY 9.0333%, net EAY 7.6407%, equal to the published feed; the convention is the one CBK's own price line reproduces (see `tbills.ts`).

**What this does and does not establish.** It shows the code computes what its stated convention says, to four decimals, including the awkward cases. It does not independently establish the convention for bonds (Act/364 on a 182-day grid); that rests on the CBK worked example the existing tests pin. The WHT rates are an input, not a result: 15% is supported by the Cap 470 text; 10% at ten years and 0% for infrastructure bonds are unconfirmed (see `AUDIT_FINDINGS.md`).

**Observation, not a defect.** Near maturity the net yield is far below the gross (7.74% vs 17.78%) because the whole next coupon, including the accrued part the buyer paid for, is taxed. That follows from how withholding applies to the coupon at payment, and the model reproduces it; readers buying a few weeks before a coupon should see that gap explained.

**JiPange `calculateQuotedLoanCost`:** effective-rate difference between the code (unrounded annuity) and an independent rounded-instalment IRR: Ksh 10,000/12 months 0.01 bp; Ksh 500/3 months 0.8 bp; Ksh 1/6 months 1.0 bp; Ksh 5,000,000/240 months 0.00 bp; Ksh 0.04 949 bp (unrealistic input); Ksh 0.004 returns `null`.
