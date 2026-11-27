# Withholding tax on Kenyan Treasury bills for resident individuals (as of November 2026)

Research date: 27 Nov 2026. Method: WebSearch plus WebFetch of hosts the proxy allows (PwC tax summaries, Clearstream, paybillke, RSM PDFs read with pypdf). `centralbank.go.ke`, `kra.go.ke` and `new.kenyalaw.org` could not be read directly (kenyalaw returned an empty page; serrarigroup returned 403), so CBK and KRA wording below comes from **search-result snippets** and is marked as such. No CEIC or Trading Economics material was used.

**Bottom line:** For a resident individual without a KRA tax exemption certificate, the discount on 91-, 182- and 364-day T-bills is "interest" and is subject to **15% withholding tax**. The tax is **final** for individuals (qualifying interest, since the Tax Laws (Amendment) Act 2020). CBK takes it **at purchase**: the investor pays the discounted price plus the tax, so the discount received is effectively net of 15%. No enacted Finance Act from 2023 to 2026 exempted T-bill interest or changed the rate, as far as any source found shows. The "T-bills are tax-exempt" claim is not supported by any statute, KRA notice or CBK document found. It most likely comes from CBK's own worked example, which shows a "tax-exempt investor" column (for holders with a KRA certificate, such as pension schemes), or from confusion with infrastructure bonds. Confidence: **high** on 15% and on collection at source; **medium-high** on "final" applying to bills specifically (the statute was not read verbatim).

---

## 1. Under current law, is the T-bill discount subject to 15% WHT for resident individuals? Which provisions apply?

### Takeaway
Yes. The Income Tax Act's definition of "qualifying interest" covers interest, discount or original issue discount received by a resident individual. Since 25 April 2020, any such interest subject to 15% WHT is a final tax. The Third Schedule rate for "qualifying interest — other" is 15%, and every current tax table puts T-bills at 15%.

### Cited Findings
- The Tax Laws (Amendment) Act 2020 replaced the definition of "qualifying interest". It now covers "the aggregate interest, discount or original issue discount receivable by a resident individual" (search snippet of the Income Tax Act text, KRA/Kenya Law copies, not opened verbatim). — [Income Tax Act, Kenya Law consolidated text](https://new.kenyalaw.org/akn/ke/act/1973/16/eng@2024-12-27); [KRA Income Tax Act 2026 PDF](https://www.kra.go.ke/images/publications/Income-Tax-Act-2026.pdf)
- A 2017 revised copy of the Act states that "interest" in section 2 includes any premium or discount by way of interest. This came from a Scribd copy via a search snippet; medium confidence. — [Scribd copy of IncomeTaxAct2of1975](https://www.scribd.com/document/452933455/IncomeTaxAct2of1975-pdf)
- RSM Kenya on TLAA 2020 (assented 25 April 2020), read from the PDF: "The definition of qualifying interest has been amended to make any interest earned by a resident individual that is subject to 15% withholding tax, to be final tax. Previously, only interest earned from a licenced bank, financial institution or building society, Central Bank of Kenya and on a bond approved by the CS Finance that was subject to 15% withholding tax was treated as final tax, and any other interest that was not specifically exempt was subject to 30% tax." — [RSM Kenya, Income tax amendments, TLAA 2020](https://www.rsm.global/kenya/sites/default/files/media/rsm_kenya_income_tax_amendments_-_tax_laws_amendment_act_2020.pdf)
- PwC Worldwide Tax Summaries, Kenya WHT (last reviewed 17 July 2026), resident rates: "Qualifying interest: Housing bonds 10; Bearer instruments 20; Other 15". "Interest: Other 15". "Government bearer bonds (maturity ≥ 2 years) 15". "Bearer bonds (maturity ≥ 10 years) 10". — [PwC Tax Summaries: Kenya withholding taxes](https://taxsummaries.pwc.com/kenya/corporate/withholding-taxes)
- RSM East Africa Kenya Tax Guide 2025/26, read from the PDF: "Interest (including 2-year Gov't bearer bonds) … 15% [resident] 15%* [non-resident]". Footnote (4): "Final tax for individuals. Not final tax for resident companies, trusts, clubs etc." — [RSM Kenya Tax Guide 2025-26](https://www.rsm.global/kenya/sites/default/files/media/EA%20Booklets/RSMEA%20Kenya%20Tax%20Guide%202025-26%20-%202026.pdf)
- KRA FAQ (search snippet): withholding tax is a final tax when it relates to winnings, qualifying interest, qualifying dividend and pensions for resident payees. — [KRA: Everything about withholding tax](https://www.kra.go.ke/helping-tax-payers/faqs/everything-about-withholding-tax)
- Clearstream Kenya market taxation guide (last updated 29 May 2026), table row "Treasury bills: 15%". Government bonds up to 10 years 15%, 10 years and above 10%, infrastructure bonds 0%. "Withholding Tax is retained at source. Tax reclaim is not common practice in Kenya." — [Clearstream market taxation guide: Kenya](https://clearstream.com/clearstream-en/res-library/market-coverage/market-taxation-guide-kenya-5116362)
- This repository's own reading of the KRA copy of the Income Tax Act (Rev. 2017), Third Schedule: qualifying interest for residents is "10% of the gross amount for housing bonds, 20% for a bearer instrument, 15% in any other case". Nothing in that text exempts T-bill interest. — `docs/overhaul/LEGAL-REVIEW.md` (primary text read via the Netlify `cbk-gaps` route)

### Inferences
- A T-bill is not a housing bond. A DhowCSD-registered bill is a book-entry security, not a bearer instrument. So the "15% in any other case" limb applies.
- Because the 2020 definition expressly includes "discount", the gap between the face value and the price paid is qualifying interest, and the 15% is final for a resident individual. No further tax arises on filing, and the interest does not need to be declared as additional taxable income. This is consistent with RSM footnote (4) and the KRA FAQ.
- The "final" treatment does not apply to resident companies, trusts or clubs (RSM footnote 4). For them the 15% is an advance against corporation tax.

### Gaps
- The verbatim current text of section 2 ("interest", "qualifying interest") and of Third Schedule Head B was not read in this session. kenyalaw returned an empty page and kra.go.ke is blocked. The definitions above come from search snippets and an RSM summary. `cbk-gaps` is already scheduled to read the KRA consolidated Income Tax Act 2026 (see LEGAL-REVIEW.md); the posted text should confirm this.

---

## 2. Did any Finance Act (2023, 2025, 2026) exempt T-bill interest or change its rate? Any unenacted proposals?

### Takeaway
No enacted change was found. No Finance Act or Tax Laws (Amendment) Act from 2020 to 2026 exempted T-bill interest or changed the 15% rate in any commentary found. The only related proposal on government paper concerned **infrastructure bonds** (Finance Bill 2024, which was withdrawn), not bills.

### Cited Findings
- **TLAA 2020** (assented 25 Apr 2020) made 15% WHT on any resident individual's interest a final tax. It also retained, among others, the exemptions for NSSF income, investment income of pooled funds of registered retirement benefit schemes, and "interest income from listed infrastructure bonds including green bonds with a maturity of three years or more". T-bills appear nowhere in the exemption list. — [RSM Kenya on TLAA 2020](https://www.rsm.global/kenya/sites/default/files/media/rsm_kenya_income_tax_amendments_-_tax_laws_amendment_act_2020.pdf)
- **Finance Bill/Act 2023:** search found no T-bill provision. PwC's Finance Bill 2023 highlights were listed but not opened. — [PwC tax alert: Finance Bill 2023](https://www.pwc.com/ke/en/assets/pdf/tax-alert-highlights-of-finance-bill-2023.pdf) (gap: not read)
- **Finance Bill 2024** (published May 2024, **withdrawn/not enacted** after the June 2024 protests) proposed removing the exemption on interest from listed infrastructure and social bonds of three years or more, except for bonds already listed, and a 5% WHT on such interest. It contained no T-bill proposal in the commentary found. The **Tax Laws (Amendment) Act 2024** (December 2024) followed; whether it carried the infrastructure-bond change was not verified. — [EY: Kenya proposes tax changes under Finance Bill 2024](https://www.ey.com/en_gl/technical/tax-alerts/kenya-proposes-tax-changes-under-the-finance-bill--2024); [KPMG Tax Laws (Amendment) Act 2024 analysis](https://assets.kpmg.com/content/dam/kpmg/ke/pdf/tax/2024/Tax%20Laws%20%28Amendment%29%20Act%202024%20Analysis_final.pdf)
- **Finance Bill 2025** (presented 30 Apr 2025) and **Finance Act 2025** (assented 26/27 June 2025): the WHT changes concerned software payments, supplies of goods to public entities, shipping and penalties. No T-bill change appears in the commentary found. — [Cliffe Dekker Hofmeyr: Unpacking the Kenya Finance Bill 2025](https://www.cliffedekkerhofmeyr.com/en/news/publications/2025/Practice/Tax-Exchange-Control/tax-and-excahnge-control-alert-5-may-Unpacking-the-Kenya-Finance-Bill-2025-Whats-changing); [EY: Kenya enacts Finance Act 2025](https://taxnews.ey.com/news/2025-1498-kenya-enacts-finance-act-2025)
- **Finance Act 2026** (assented 23 June 2026, gazetted 26 June; effective 1 July 2026 and 1 Jan 2027): commentary covers trustee income (qualifying interest and dividends not taxed again), winnings, scrap metal and inter-institutional interest. Nothing on T-bills. — [EY: Kenya enacts Finance Act 2026](https://taxnews.ey.com/news/2026-1445-kenya-enacts-finance-act-2026); [PwC tax alert: Finance Act 2026](https://www.pwc.com/ke/en/assets/pdf/tax-alert-finance-act-2026.pdf). The repository's own reading of windows of the KRA Finance Act 2026 text found no passage on T-bill interest (`docs/overhaul/LEGAL-REVIEW.md`; excerpts only).
- **Income Tax (Withholding Tax) Rules 2026**, effective 28 August 2026: procedural rules for deduction, declaration, payment and recovery. KPMG says they "do not … provide new withholding tax rates". — [KPMG: Kenya new withholding tax rules](https://kpmg.com/us/en/taxnewsflash/news/2026/10/kenya-new-withholding-tax-rules.html)
- PwC's table (reviewed 17 July 2026, i.e. after Finance Act 2026) still shows 15% for "qualifying interest: other". — [PwC Tax Summaries](https://taxsummaries.pwc.com/kenya/corporate/withholding-taxes)

### Inferences
- A tax table updated after the Finance Act 2026 still shows 15%, and no Finance Act commentary from 2023 to 2026 mentions bills. Together these are strong evidence that the 15% rate stands in November 2026. This is an argument from absence across several commentators, not a reading of the statute.

### Gaps
- The full Finance Act 2023 and 2026 texts were not read end to end.
- Whether the Tax Laws (Amendment) Act 2024 enacted the infrastructure-bond change is outside this note's scope, but it matters for the 0% IFB default.

---

## 3. What do CBK sources say? Does CBK withhold at source, and is the discount received net of tax?

### Takeaway
CBK's own FAQ on Government Securities applies 15% WHT to the T-bill discount for a taxable investor. It exempts an investor only on presentation of a KRA Tax Exemption Certificate. The tax is collected when the bill is paid for: the settlement amount is the discounted price plus the tax.

### Cited Findings
- CBK FAQ on GoK Securities (search snippet, verbatim): "An investor will be exempt from paying withholding Tax on presentation of Tax Exemption Certificate from the Kenya Revenue Authority (KRA)." — [CBK FAQs on GoK Securities](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf); [alternate copy](https://www.centralbank.go.ke/images/FAQs/Frequently%20Asked%20Questions%20on%20GoK%20Securities.pdf)
- The CBK worked example (search snippet) is a 91-day bill at 7.65% on KSh 12,000,000. Price KSh 11,775,360, so the discount is KSh 224,640 over three months. Snippet wording: "For Withholding Tax payer at 15%, the investor's total return/interest amount will be Ksh (12,000,000 – 11,775,360) = Ksh 224,640". Net return after 15% WHT is KSh 190,944, against KSh 224,640 for a tax-exempt investor. Arithmetic check: 224,640 × 0.85 = 190,944. The figures reconcile. — [CBK FAQs on GoK Securities](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf)
- CBK: Treasury bills are issued in 91-, 182- and 364-day maturities. Resident or non-resident individuals and corporate bodies may invest, directly through DhowCSD or via a bank. — [CBK Treasury Bills page](https://www.centralbank.go.ke/securities/treasury-bills/) (snippet)
- paybillke.com guide (updated and "verified" 25 Oct 2026): "In CBK's own worked example, a taxable investor pays 15% withholding tax on the discount … collected when you pay for the bill, unless you hold a tax exemption certificate from KRA." "On a 364-day bill of KSh 100,000 that is about KSh 1,238.78." "The payment amount in DhowCSD is the figure to go by." — [paybillke: Treasury bills Kenya DhowCSD](https://paybillke.com/guides/treasury-bills-kenya-dhowcsd)
- Serrari guide (search snippet): the settlement amount is "Discounted price + Tax", with tax calculated on gross interest (face value minus discounted price). — [Serrari: Beginner's guide to Treasury bills](https://serrarigroup.com/serrari-treasury-bills/)

### Inferences
- The mechanics: the investor pays price + 15% × (face − price) at settlement and receives the full face value at maturity. The net discount is 85% of the gross discount, and the tax is withheld at source by CBK as fiscal agent. The repository's `TBILL_WHT_RATE = 0.15` (`src/lib/tbills.ts`) and the bill handling in `src/lib/switch.ts` match this.
- CBK's FAQ conditions the exemption on a certificate. That rules out a blanket individual exemption: an exempt-by-law individual category would not need case-by-case certificates.

### Gaps
- The CBK FAQ's date or revision was not visible in the snippets. The 7.65% example suggests it predates the recent rate cycle, but the mechanism is unchanged.
- The DhowCSD FAQ (Dec 2025) surfaced only as a title. Its WHT wording is not confirmed ([DhowCSD FAQ](https://www.centralbank.go.ke/wp-content/uploads/2025/12/DhowCSD-Frequently-Asked-Questions.pdf)). It is also on the repository's unread list for `cbk-gaps`.
- Individual auction results notices were listed in search but not read for tax wording.

---

## 4. What do brokers, banks and Big Four guides say? Who claims an exemption, and why?

### Takeaway
Every authoritative tax guide found (PwC, RSM, KPMG via repository notes, Clearstream) gives 15% on T-bills or on "other qualifying interest". The exemption claim traces to Serrari Markets, a private financial-literacy site. Serrari contradicts itself (its own beginner's guide adds tax at settlement) and cites no statute.

### Cited Findings
- **Claim of exemption:** Serrari Markets (search snippet, about March 2026): "Interest on Kenyan Treasury bills is exempt from withholding tax for individual investors". The same article compares T-bill yields with deposits and MMFs "where a 15% withholding tax applies". No legal basis is cited. — [Serrari, financial literacy article](https://serrarigroup.com/?p=39581) (direct fetch returned 403; snippet only)
- **Same publisher, opposite treatment:** Serrari's beginner's guide gives settlement = discounted price + tax on gross interest. — [Serrari: Beginner's guide to Treasury bills](https://serrarigroup.com/serrari-treasury-bills/)
- **15% sources:** PwC (17 Jul 2026), [PwC](https://taxsummaries.pwc.com/kenya/corporate/withholding-taxes). RSM 2025/26 (final for individuals), [RSM](https://www.rsm.global/kenya/sites/default/files/media/EA%20Booklets/RSMEA%20Kenya%20Tax%20Guide%202025-26%20-%202026.pdf). Clearstream (29 May 2026), "Treasury bills 15%", [Clearstream](https://clearstream.com/clearstream-en/res-library/market-coverage/market-taxation-guide-kenya-5116362). KPMG 2020 Africa fiscal guide, 15% on government securities, as recorded in the repository's LEGAL-REVIEW.md, [KPMG 2020 guide](https://assets.kpmg.com/content/dam/kpmg/za/pdf/2021/2020-africa-fiscal-guide-kenya.pdf). The repository's 4 Oct benchmark also recorded a CPA's January 2026 note that T-bill interest is subject to WHT (CLAUDE.md "Benchmarked 4 Oct" row; URL not recorded there).
- **A note that can mislead:** PwC's treaty table attaches note (1), "Interest paid by the government and the Central Bank of Kenya is tax-exempt", to the **treaty rates** for Denmark, Germany, Norway and the United Kingdom. — [PwC Tax Summaries](https://taxsummaries.pwc.com/kenya/corporate/withholding-taxes)
- No broker- or bank-specific (NCBA, Standard Chartered, CIC, Genghis, Faida) T-bill tax page surfaced in the searches run.

### Inferences (likely origins of "T-bills are tax-exempt")
1. **CBK's worked example has a "tax-exempt investor" column** beside the 15% case. Read carelessly, it suggests exemption is a normal option. It applies only with a KRA certificate. (High plausibility.)
2. **Confusion with infrastructure bonds (IFBs)**, whose interest is exempt (Clearstream 0%; TLAA 2020 retained the exemption). Both are "government securities bought from CBK", and IFBs are the product most marketed as "tax-free". (High plausibility.)
3. **Treaty exemption for certain non-residents.** Under some DTAs (Denmark, Germany, Norway, UK, per PwC note 1), interest paid by the Kenyan government or CBK is exempt in Kenya. That is a non-resident treaty rule, not a resident-individual rule. (Medium plausibility as a source of the claim; certain as a real exception.)
4. **"Final tax" misread as "no tax".** Because the 15% is final, individuals need not declare T-bill interest on their return. "Not declared or taxed again" is easily paraphrased as "tax-free". (Plausible; not directly evidenced.)
5. **Exempt holders.** Pension schemes, NSSF and other institutions buy most bills and do not suffer WHT (see question 5). Generalising from them gives "T-bills are untaxed". (Plausible.)
- Serrari's quoted T-bill yields (cited in the repository's benchmark row as 14–17%, against actual ~8.8–9.0%) also suggest its article is stale or carelessly sourced.

### Gaps
- No bank or broker product page was read directly. Broker corroboration rests on paybillke (Oct 2026) and Serrari's beginner's guide.
- KPMG/PwC Kenya 2026 tax cards were not opened. The PwC online summary (July 2026) stands in for them.

---

## 5. Are there holders for whom T-bill interest IS exempt?

### Takeaway
Yes. Holders whose income is exempt under the First Schedule receive T-bill discount free of WHT on presenting a KRA Tax Exemption Certificate to CBK. These include registered pension and provident schemes' pooled investment income and NSSF. Certain non-residents may also be exempt under a tax treaty. Resident individuals investing in their own name are not in any exempt class.

### Cited Findings
- The TLAA 2020 retained exemptions for "Income of the National Social Security Fund", "Income of the National Hospital Insurance Fund", "Investment income of pooled funds of a registered retirement benefits scheme" and "Income of a registered home ownership savings plan". — [RSM Kenya on TLAA 2020](https://www.rsm.global/kenya/sites/default/files/media/rsm_kenya_income_tax_amendments_-_tax_laws_amendment_act_2020.pdf)
- The Tax Appeals Tribunal (reported by EY on 5 Feb 2025) held that a registered pension scheme's total income is exempt under section 13 and paragraph 12 of Part I of the First Schedule. KRA had issued that scheme an income-tax exemption certificate. — [EY: Tax Appeals Tribunal rules pension scheme income exempt](https://taxnews.ey.com/news/2025-0396-kenya-tax-appeal-tribunal-rules-income-earned-by-registered-pension-scheme-is-exempt-from-income-tax); [TAT judgment, Kenya Law](https://new.kenyalaw.org/akn/ke/judgment/ketat/2024/1294/eng@2024-08-30)
- CBK: exemption from WHT on T-bills applies "on presentation of Tax Exemption Certificate from the Kenya Revenue Authority (KRA)". — [CBK FAQs on GoK Securities](https://www.centralbank.go.ke/images/FAQs/FAQsGoKSecurities.pdf) (snippet)
- Under some DTAs (Denmark, Germany, Norway, UK), interest paid by the Kenyan government or CBK is tax-exempt for treaty residents. — [PwC Tax Summaries](https://taxsummaries.pwc.com/kenya/corporate/withholding-taxes)
- Finance Act 2026 adds that qualifying interest already taxed is not taxed again in a trustee's hands. This avoids double tax; it is not an exemption. — [EY: Finance Act 2026](https://taxnews.ey.com/news/2026-1445-kenya-enacts-finance-act-2026)

### Inferences
- An individual saving through a registered pension scheme or a unit-linked fund gains indirectly from untaxed bills held by the fund. That is a feature of the holder, not of the instrument.

### Gaps
- No source confirmed how CBK applies the certificate operationally in DhowCSD (for example, a field on the CSD account). Only the FAQ's one sentence was found.
- The specific treaty article wording for each listed country was not read.

---

## Conflicts and which source is authoritative

| Claim | Sources | Authority |
|---|---|---|
| 15% WHT on T-bill discount, final for resident individuals | CBK FAQ (snippet), PwC Jul 2026, RSM 2025/26, Clearstream May 2026, paybillke Oct 2026, ITA Third Schedule (repo reading of Rev. 2017) | **Authoritative**: CBK is the issuer and withholding agent; the Big Four and RSM summarise statute |
| T-bills exempt for individuals | Serrari Markets (~Mar 2026), contradicted by Serrari's own guide | **Not supported**: no statute, KRA notice or CBK text cited |
| "Interest paid by government and CBK is tax-exempt" | PwC treaty-table note (1) | Applies to treaty non-residents only |

**Recommendation for the engine:** keep `TBILL_WHT_RATE = 0.15` and the "not adopted" stance on the exemption claim. The open item is to confirm the verbatim section 2 and Third Schedule text when `cbk-gaps` posts the KRA Income Tax Act 2026. That would raise "final for bills" from medium-high to high confidence. It would not change any number.
