# Kenyan consumer credit: current pricing and cost-of-credit disclosure rules (research as of 27 Nov 2026)

Method note: research was done with WebSearch and WebFetch from a sandbox. `centralbank.go.ke` is egress-blocked from this session, and Safaricom, Kenya Times, Cliffe Dekker, PwC and NCBA PDFs returned 403 or redirected, so several items rest on search-result summaries rather than on the primary text. Every figure is labelled with how it was obtained. "Fetched" means the page itself was read. "Search summary" means only a search snippet or summary was seen, and the confidence is lower. No CEIC or Trading Economics sources are used.

## 1. SACCO loans: typical rate, SASRA framework, add-on fees, deposit multiples

### Takeaway
"1% per month on reducing balance" (12% p.a.) is still the usual headline SACCO rate in 2026, and 3x to 4x deposits is the usual limit. Neither is regulated. SASRA publishes no rate card and no fee cap, so each SACCO's bylaws set the rate, the method (some quote flat), processing fees, insurance and guarantor rules. For the calculator, 1%/month reducing is a reasonable labelled default, but the rate method has to be a user input.

### Cited Findings
- Typical SACCO rate is 1.0% to 1.5% per month on reducing balance (calculator site; individual SACCO rates are described as unpublished or unverified). Search summary, low-to-medium confidence. — [paybillke SACCO loan calculator](https://paybillke.com/calculators/sacco-loan-calculator)
- "Indicative 12% a year on a reducing balance (1% a month), a common rate among Kenyan SACCOs". Search summary, medium confidence. — [businessradar SACCO loan comparison](https://businessradar.co.ke/sacco-loan-comparison-kenya/)
- **Conflict on method:** one guide says "almost all Kenyan SACCOs quote loans on a flat interest basis rather than reducing-balance". Other sources say most development and emergency loans are on a reducing balance. — [paybillke: SACCO vs bank vs mobile app](https://paybillke.com/guides/sacco-loan-vs-bank-loan-vs-mobile-app-kenya); [businessradar](https://businessradar.co.ke/?p=13519)
- A flat 1% per month equals about 22–24% APR on a reducing basis. Search summary. (This is consistent with standard flat-to-reducing arithmetic, where the flat rate is roughly half the equivalent reducing rate.) — [paybillke SACCO calculator](https://paybillke.com/calculators/sacco-loan-calculator)
- Deposit multiple: "most Kenyan SACCOs lend 3-4x your deposit"; "terms up to 6 years, 3x to 4x multiplier is typical for development loans". One comparison lists a Mwalimu National development loan at "Reducing balance, 4 x deposits, 60 months, 0.5% processing". Search summary, medium confidence. — [paybillke](https://paybillke.com/calculators/sacco-loan-calculator); [businessradar SACCO loan comparison](https://businessradar.co.ke/sacco-loan-comparison-kenya/)
- Fees vary by SACCO. Processing fees are a percentage of the loan (Haki Tume Sacco terms). Some SACCOs advertise no processing fee. Insurance and clearance fees on top-ups are charged separately. Guarantors are the most common collateral, and no separate guarantor fee was found. — [Haki Tume Sacco loan terms](https://sacco.knchr.org/loan-terms.html); [businessradar](https://businessradar.co.ke/sacco-loan-comparison-kenya/); [FSD Kenya SACCO Subsector Report (Jan 2026)](https://www.fsdkenya.org/wp-content/uploads/2026/01/SACCO-Subsector-Report-Lessons-from-FinAccess-Surveys.pdf)
- Policy pressure, January 2026: Cooperatives PS Patrick Kilemi urged SACCOs to lower rates "from as high as 12 percent" toward single digits. This was advocacy, not a rule. — [People Daily](https://peopledaily.digital/business/kenyans-pushing-saccos-to-lower-lending-rates-to-single-digits)
- A CBK survey reported that SACCOs have "the most hidden loan charges" (headline only, details not read; the article's date was not confirmed). — [The Standard](https://www.standardmedia.co.ke/business/article/2001432066/saccos-have-the-most-hidden-loan-charges-cbk-survey-shows)
- SASRA's legal framework is the Sacco Societies Act 2008 plus the Deposit-taking Sacco Business Regulations 2010 (LN 95/2010) and the Non-Deposit-Taking Business Regulations 2020 (LN 82/2020). The searches surfaced no provision capping SACCO rates or fees. — [Kenya Law LN 95/2010](https://new.kenyalaw.org/akn/ke/act/ln/2010/95/eng@2022-12-31); [Kenya Law LN 82/2020](https://new.kenyalaw.org/akn/ke/act/ln/2020/82/eng@2022-12-31); [Sacco Societies Act](https://new.kenyalaw.org/akn/ke/act/2008/14/eng@2025-06-20/source)

### Inferences
- A SACCO is the only product here with no regulated cost-disclosure metric (SACCOs are outside the CBK TCC website). The calculator should therefore build an APR itself from rate, method (flat or reducing), processing fee percentage and insurance percentage, rather than trusting a quoted rate.
- The monthly-to-annual convention matters: 1%/month reducing is 12% nominal p.a. and 12.68% effective with monthly compounding.

### Gaps
- No SASRA-published survey of average SACCO lending rates for 2026 was found.
- There is no authoritative typical figure for loan-protection insurance (often quoted informally at around 0.5–1% of the loan) or for appraisal fees. The informal range is not sourced and should not be used as a default without a source.
- The SASRA regulation text was not read, so whether it says anything on interest disclosure is unconfirmed.

## 2. Bank personal loans: rates after risk-based pricing and KESONIA; TCC; costofcredit.co.ke

### Takeaway
Since the CBK's revised risk-based credit pricing model (2025), a bank loan is priced as a reference rate (CBR or KESONIA) plus a borrower-specific premium K, plus fees. CBR has been 8.75% since February 2026 and was held on 7 October 2026. The mean bank lending rate was 14.5% in May 2026. Quoted bank rates are nominal annual on reducing balance, and the regulated comparison metric is the Total Cost of Credit and its APR on the CBK/KBA site costofcredit.co.ke.

### Cited Findings
- **Pricing formula (revised RBCPM):** final cost to the borrower is the reference rate plus a premium based on the customer's risk profile, and the premium covers operating costs and expected shareholder return. Search summary of the CBK press release and law-firm notes. — [CBK Revised Risk-based Credit Pricing Model (Aug 2025)](https://www.centralbank.go.ke/wp-content/uploads/2025/08/Revised-Risk-based-Credit-Pricing-Model.pdf); [CBK press release](https://www.centralbank.go.ke/uploads/press_releases/2044081907_Press%20Release%20-%20Issuance%20of%20a%20Revised%20Risk-Based%20Credit%20Pricing%20Model.pdf); [Cliffe Dekker Hofmeyr, 22 June 2026](https://www.cliffedekkerhofmeyr.com/en/news/publications/2026/Kenya/Banking-Finance-Projects/banking-finance-and-projects-alert-22-june-Kenya-2026-Banking-Law-Reforms-KESONIA-risk-based-pricing-and-the-mandatory-loan-transition-explained)
- **Business Daily, 29 July 2026 (fetched):** CBR and KESONIA "have converged at 8.75 percent". KESONIA is held within a corridor of ±0.5pp around CBR. The mean commercial bank loan rate was 14.5% in May 2026, down from a 15.4% peak in May 2025. 27 of 37 lenders chose CBR as their benchmark, including Equity, KCB, Absa, StanChart, NCBA and DTB. Co-op Bank, Habib Bank AG Zurich and ABC chose KESONIA. Citibank and Stanbic use both. Banks must publish weighted average lending rates, weighted average premiums and fees on the TCC website. — [Business Daily](https://www.businessdailyafrica.com/bd/corporate/health/uniform-cost-of-credit-as-base-loan-rates-converge-at-8-75pc-5540714)
- **CBR 8.75%, retained at the MPC of 7 October 2026.** It has been 8.75% since February 2026, cut from 9.0%. Search summary of the CBK release plus press. — [CBK: MPC retains the CBR at 8.75 percent (7 Oct 2026)](https://www.centralbank.go.ke/2026/10/07/mpc-retains-the-cbr-at-8-75-percent-3/); [AllAfrica, Aug 2026](https://allafrica.com/stories/202608120026.html). **Conflict:** one search summary said the CBR had been cut "eight times to 9.25% from 13%". That is an older vintage (a 2025 level), superseded by the Feb–Oct 2026 releases.
- Banks charged premiums of "up to 16.57pc" under the new pricing (headline, Business Daily syndication, date not confirmed). — [Business Daily via mwanaspoti](https://www.mwanaspoti.co.tz/bd/markets/market-news/banks-charge-premiums-of-up-to-16-57pc-in-new-loan-pricing-5434440)
- Older per-bank rates (date not confirmed, probably 2025): Equity 14.96%, DTB 14.56%, Stanbic 11.80%. The KBA portal compares 33 banks on a one-year KSh100,000 personal loan, with Habib AG Zurich cheapest and Sidian priciest. — [Business Daily: cheapest and costliest banks](https://www.mwanaspoti.co.tz/bd/corporate/companies/cheapest-and-costliest-banks-for-personal-loans-revealed-5250490)
- TCC example (press, date not confirmed): for a KSh1m, 60-month unsecured personal loan, KCB's TCC was KSh554,453 and DTB's KSh469,800 at an APR of 16.63%. — [Business Daily](https://www.businessdailyafrica.com/bd/markets/capital-markets/kenya-s-most-expensive-cheapest-loans-revealed-3323990) (search summary)
- **costofcredit.co.ke (glossary fetched, 27 Nov 2026):** "The total cost of credit = KESONIA/CBR + Premium (K) + Fees and Charges". "Annual Percentage Rate or APR is the numerical representation of the Total Cost of Credit". Fees and charges include "processing fees, service fees, appraisal or valuation fees, legal fees, insurance premiums (where applicable)", late payment penalties and administrative or transactional costs. Third-party costs "include legal fees, insurance, valuation and government levies". The page gives no APR annualisation formula, and the APR definition still mentions the retired KBRR (an internal inconsistency). — [costofcredit.co.ke glossary](https://costofcredit.co.ke/site/glossary)
- The site is run by KBA with CBK, gives an "indicative" TCC calculator covering banks and microfinance banks, and says displayed APRs are estimates. It launched in June 2017. — [costofcredit.co.ke terms](https://costofcredit.co.ke/); [CBK press release, June 2017](https://www.centralbank.go.ke/uploads/press_releases/712400338_Press%20Release-Launch%20of%20Cost%20of%20Credit%20Website-June%202017.pdf); [KBA](https://www.kba.co.ke/the-central-bank-of-kenya-cbk-and-the-kenya-bankers-association-kba-are-pleased-to-announce-the-official-launch-of-cost-of-credit-website/)
- Legal basis (search summary): loan disclosure is Banking Act **s.31A "Disclosure of information on loans"** (the brief's "s.31" is probably this). The CBK Consumer Protection Guideline **CBK/PG/22** is issued under s.33(4). The Banking (Consumer Protection) Regulations 2013 and the prudential guidelines mandate transparency on rates, repayment schedules, default penalties and total cost of credit. **s.44A** is the in duplum rule, in force 1 May 2007 under Banking (Amendment) Act No. 9 of 2006. — [Banking Act (Kenya Law, 27 Dec 2024 consolidation)](https://new.kenyalaw.org/akn/ke/act/1989/9/eng@2024-12-27/source); [CBK Prudential Guidelines](https://centralbank.go.ke/wp-content/uploads/2016/08/PRUDENTIAL-GUIDELINES.pdf); [TripleOKLaw on in duplum](https://www.tripleoklaw.com/?p=7195); [CBK Consumer Protection guideline copy on costofcredit.co.ke](https://costofcredit.co.ke/downloads/Centra_%20Bank_of_Kenya_Consumer%20_Protection.pdf)
- **s.33B (interest rate cap):** the cap was repealed in November 2019 (Finance Act 2019). This is from background knowledge and was not re-verified this session, so treat it as a lead. Its relevance is that there is no statutory cap today. Bank pricing changes require CBK approval under the RBCPM, per the press release above.
- CBK published a draft **Financial Consumer Protection Framework (March 2026)** with a "Disclosure and Transparency" section. It is a draft, and its APR wording was not read. — [CBK Consumer Protection Framework March 2026](https://www.centralbank.go.ke/wp-content/uploads/2026/04/Consumer-Protection-Framework-March-2026.pdf)

### Inferences
- A late-2026 unsecured personal loan default of about 14–15% nominal p.a. reducing balance (CBR 8.75% plus a premium of roughly 5–7pp) fits the May 2026 mean of 14.5%. Fees (arrangement, commonly 1–3%; insurance; legal) then lift the APR above the nominal rate. The 1–3% arrangement-fee range is NOT sourced this session. Use the costofcredit.co.ke APR for a named bank instead.
- Excise duty on bank loan fees: 20% excise on fees charged by financial institutions is the usual treatment, and it is consistent with the NCBA and Fuliza excise figures below. No bank-specific source was read, so mark it unconfirmed for bank loans.

### Gaps
- Bank-by-bank personal loan rates and premiums for October–November 2026 were not found. costofcredit.co.ke's calculator is dynamic and was not queried.
- The exact APR formula CBK/KBA use (IRR-based or otherwise) is not stated on the glossary page.
- The text of s.31A and CBK/PG/22 was not read (CBK host blocked).

## 3. CBK-regulated digital lenders (Tala, Branch, Zenka etc.) under the DCP Regulations 2022

### Takeaway
DCP pricing is risk-based and quoted per day or per 4 weeks, not per year. Tala's own site gives 0.3%–0.6% per day (APR 109.5%–219%), terms of 1 to 61 days, and an 8% one-off late charge on day 61. Branch is reported at 1.7%–17.6% per month. The DCP Regulations 2022 require disclosure of interest rate, fees, reducing-balance basis and total cost of credit before disbursement, but they set no explicit rate cap. Interest on DCP loans is no longer subject to excise from 27 December 2024 (per Tala).

### Cited Findings
- **Tala (own site, fetched 27 Nov 2026):** "Interest rates are as low as 0.3% per day". You pay only for days used and there is no minimum interest. Repay any day from 1 to 61, with a maximum due date 61 days after withdrawal. A one-time 8% charge applies on the balance on the 61st day if unpaid. There is no M-Pesa transfer fee. "Effective 27 December 2024" the 20% excise duty no longer applies to Tala's loan interest (including late fees), and the example repayment on 1,000 falls from 1,180 to 1,150. — [Tala line-of-credit FAQ](https://tala.co.ke/loc-faq-1/)
- Tala's site (search summary) says interest is 0.3%–0.6% daily with an APR of 109.5%–219.0%, determined by risk-based pricing. That APR is simple ×365, not compounded. — [Tala](https://tala.co.ke/?p=8651) (search summary)
- **Conflict on Tala's structure:** paybillke (May 2026) describes Tala as a flat 15% per 21–30 days, about 270% APR. Tala's own pages describe daily interest. The lender's own page is preferred. — [paybillke: loan apps effective APR 2026](https://paybillke.com/guides/kenya-loan-apps-effective-apr-2026)
- Business Radar: Tala loans of KES 1,000–50,000, with a repayment term of up to 120 days. This conflicts with Tala's own "61 days" and may be a different product. — [businessradar](https://businessradar.co.ke/?p=2925)
- **Branch:** 8.7%–19.5% per 4 weeks, effective APR about 130–280% (paybillke, verified May 2026). Another 2026 source gives 1.7%–17.6% monthly. Both are third-party, and no Branch primary page was read. — [paybillke](https://paybillke.com/guides/kenya-loan-apps-effective-apr-2026); [Kenya Times, 3 Jul 2026](https://thekenyatimes.com/business/interest-rates-for-top-licensed-mobile-loan-apps-in-kenya/) (403, search summary only)
- **Zenka:** no current rate card was found. A Small Claims Court rejected Zenka Digital terms of 36% monthly interest (438% p.a.) plus a 1.5% daily default charge as "punitive". — [Business Daily](https://www.businessdailyafrica.com/bd/economy/court-rejects-punitive-438pc-interest-on-digital-loan-5532234)
- M-KOPA reports monthly rates of 3%–15% on its digital loans (13 Nov 2026). CBK had licensed 281 DCPs by 30 September 2026. — [TechTrendsKE](https://techtrendske.co.ke/2026/11/13/m-kopa-digital-loan-interest-rates-kenya/); [CBK DCP Directory Sept 2026](https://www.centralbank.go.ke/wp-content/uploads/2026/09/Directory-of-Digital-Credit-Providers-September-2026.pdf)
- **DCP Regulations 2022 (LN 46/2022)** require disclosure before the loan is issued of: all charges and fees, the interest rate and whether it is on a reducing balance, the **total cost of credit** (principal plus interest plus fees and charges), repayment dates and complaints procedure. Search summary of secondary sources. — [Kenya Law LN 46/2022](https://new.kenyalaw.org/akn/ke/act/ln/2022/46/eng@2022-04-22) (fetched but page content was empty); [money254](https://www.money254.co.ke/post/how-cbk-regulation-affect-borrowers-of-digital-loans-personal-loans); [TechCrunch, 23 Mar 2022](https://techcrunch.com/2022/03/23/digital-lenders-in-kenya-must-disclose-source-of-funds-as-new-law-takes-effect)
- **Date conflict:** CBK announced publication on 18 March 2022, while Kenya Law shows the consolidation as of 22 April 2022. — [CBK press release](https://www.centralbank.go.ke/uploads/press_releases/2119450187_Press%20Release%20-%20Publication%20of%20Regulations%20for%20Digital%20Credit%20Providers%20and%20Commencement%20of%20their%20Supervision.pdf)
- APR context: a Competition Authority of Kenya study (2021) found an average APR of 280.5% among four unregulated DCPs. — [KIPPRA](https://kippra.or.ke/regulation-of-digital-credit-providers-in-kenya-policy-issues-and-options/)
- Excise on DCPs: the Tax Laws (Amendment) Act 2024 defined "digital lender" (a CBK DCP licensee) in the Excise Duty Act, effective 27 December 2024. 20% excise on fees charged by digital lenders has applied since 1 July 2022 (Tribunal upheld). Whether interest is excluded was NOT confirmed from the Act or PwC (403). Tala's own statement is the only source that it is excluded. — [KPMG TLAA 2024 analysis](https://assets.kpmg.com/content/dam/kpmg/ke/pdf/tax/2024/Tax%20Laws%20%28Amendment%29%20Act%202024%20Analysis_final.pdf); [EY, 14 Jan 2025](https://taxnews.ey.com/news/2025-0233-kenya-enacts-changes-under-the-tax-laws-amendment-act-2024-and-other-legislation); [PwC tax alert](https://pwc.com/ke/en/assets/pdf/tax-alert-fees-charged-by-digital-lenders.pdf) (not readable)
- A draft CBK Non-Deposit-Taking Credit Providers Regulations 2025 exists (scope and status not read). — [CBK draft (Aug 2025)](https://www.centralbank.go.ke/wp-content/uploads/2025/08/Draft-Central-Bank-of-Kenya-Non-Deposit-Taking-Credit-Providers-Regulations-2025.pdf)

### Inferences
- The "APR" figures DCPs print (Tala's 109.5–219%) are daily rate ×365, i.e. nominal and uncompounded. Comparing them against a compounded APR would understate DCP cost. The calculator must state which convention it uses.
- Tala's daily-accrual model differs from fixed-fee products (M-Shwari): early repayment lowers cost on Tala but not on M-Shwari.

### Gaps
- The regulation numbers and exact wording of the DCP disclosure clauses were not read, and neither was whether CBK must approve pricing parameters. Kenya Law returned an empty page, and the Cliffe Dekker summary returned 403.
- No primary Branch or Zenka terms were read.
- No confirmation was found that the DCP Regulations prescribe APR (as opposed to TCC) as a mandatory disclosure.

## 4. M-Shwari (NCBA / Safaricom)

### Takeaway
M-Shwari charges a 7.5% facility fee per loan for a 30-day term, plus excise of 20% of the fee (1.5% of principal) deducted at disbursement since March 2024. A balance unpaid on day 31 is rolled over automatically with a further 7.5% fee (plus excise) on the unpaid principal. This is NCBA's key facts from June 2023, with no 2024–2026 change found. The all-in cost is 9% of principal per 30 days.

### Cited Findings
- NCBA Key Facts (21 June 2023): facility fee 7.5% on each loan disbursed, exclusive of 1.5% excise duty. Rollover fee 7.5% exclusive of 1.5% excise "for all loan principal balances that are unpaid on day 31". Search summary: the PDF redirected and was not read. — [NCBA M-Shwari Key Facts 21 June 2023](https://ke.ncbagroup.com/wp-content/uploads/2019/11/M-Shwari-Key-Facts-21-June-23.pdf); [NCBA KFD](https://ke.ncbagroup.com/wp-content/uploads/2019/11/M-SHWARI-KEY-FACTS-DOCUMENT-NCBA.pdf)
- NCBA FAQ (Feb 2024): "facility fees charged on M-Shwari loans remains the same at 7.5%", with excise at 20% of the fee. — [NCBA excise collection FAQs](https://ke.ncbagroup.com/wp-content/uploads/2024/02/CHANGE-OF-EXCISE-DUTY-COLLECTION-PROCESS-FAQs.pdf)
- Since 8 March 2024, excise is deducted at disbursement. — [The Star, 8 Mar 2024](https://the-star.co.ke/news/realtime/2024-03-08-kra-to-deduct-excise-duty-on-m-shwari-loans-at-disbursement-from-friday)
- Worked example (2026 guide): on a KSh1,000 loan, the borrower receives KSh985 and repays KSh1,075 within 30 days. Another 2026 guide: a KES5,000 loan for 30 days costs KES450 (9%). — [businessradar](https://businessradar.co.ke/?p=6652); [paybillke Fuliza true cost 2026](https://paybillke.com/guides/fuliza-true-cost-2026)
- **Conflict (historical):** the COVID-era NCBA notice applied the additional fee only if unpaid within 60 days or 2 months. The 2023 key facts restore day 31. — [NCBA COVID-19 changes](https://ke.ncbagroup.com/changes-on-m-shwari-loans-in-response-to-covid-19)
- Third-party sources say the rollover extends 30 days and charges 7.5% on the original or unpaid principal. Listing with a credit reference bureau after about 90 days late was NOT confirmed against NCBA. — [paybillke M-Shwari review 2026](https://paybillke.com/guides/m-shwari-loan-review-2026); [Nation Newsplex](https://nation.africa/kenya/newsplex/know-the-heavy-cost-of-late-repayment-before-taking-digital-credit-148676)

### Inferences
- The fee is flat per 30-day period, not interest. Repaying on day 1 costs the same as repaying on day 30.
- On the cash actually received, the cost is 90 on 985, or 9.14% per 30 days. That annualises to about 111% nominal (×365/30) and about 190% compounded.
- One rollover takes the cost to about 18% of principal over 60 days.

### Gaps
- No 2025–2026 NCBA or Safaricom statement of the current fee was read. The 7.5% figure rests on 2023–2024 NCBA documents plus 2026 third-party guides that agree with them.
- Whether the rollover fee applies to the unpaid principal only or to principal plus fees, and how many rollovers are allowed before default, was not confirmed from primary text.

## 5. Fuliza (Safaricom / NCBA / KCB)

### Takeaway
Fuliza charges a 1% access fee on each amount overdrawn, plus a daily maintenance fee by outstanding-balance band: KSh0 (1–100), 2.50 (101–500), 5 (501–1,000), 18 (1,001–1,500), 20 (1,501–2,500), 25 (2,501–70,000). Excise of 20% is added on the daily fee, so the top band costs KSh30 a day all-in. These bands date from Safaricom's October 2022 cut. A claimed June 2026 revision rests only on consumer blogs and is unverified. The limit is up to KSh70,000.

### Cited Findings
- Band table and the 1% access fee (PesaTrail, "last verified 11 August 2026 against Safaricom's published tariffs", fetched): bands as above. The daily fee starts the next day at midnight and "runs until the balance is cleared". Repayment is automatic from incoming M-Pesa. The maximum limit is KSh70,000. — [PesaTrail Fuliza guide 2026](https://pesatrail.com/fuliza-guide-2026.html)
- The top band fell from KSh30 to KSh25 in the 2022 cut, effective 1 October 2022, with the 1% access fee retained. There is a 3-day waiver for balances of KSh1,000 or less (bands KSh101–500 and 501–1,000). — [Business Today](https://businesstoday.co.ke/safaricom-slashes-fuliza-charges-see-new-tariff-and-more-details/); [The Star, 28 Sep 2022](https://www.the-star.co.ke/news/2022-09-28-fuliza-cuts-daily-fees-by-40-per-cent/); [Safaricom press release](https://www.safaricom.co.ke/media-center-landing/press-releases/safaricom-ncba-and-kcb-restructure-fuliza-with-free-daily-fees) (403, search summary)
- Excise: Kenya Times (2026) says the KSh25 fee is "plus Ksh 5 in excise duty", for a total of KSh30 a day, which implies 20%. One third-party guide says 15%, which is an older rate. 20% is consistent with NCBA's M-Shwari treatment. — [Kenya Times](https://thekenyatimes.com/business/m-pesa-fuliza-charges-across-all-loan-bands/) (403, search summary); [paybillke](https://paybillke.com/guides/fuliza-true-cost-2026)
- **Unverified June 2026 change:** Shmoney claims KSh25 for the 2,501–70,000 band "after Safaricom's June 2026 revision (down from KSh 30)". No Safaricom release confirms this, and it is most likely a mis-dating of the 2022 cut. — [Shmoney](https://shmoney.co.ke/blog/fuliza-charges-2026-daily-fees-real-cost-how-to-track-them/)
- Scale: Fuliza lends about KES6.3bn a day (9 Nov 2026). — [Tech-ish](https://tech-ish.com/2026/11/09/fuliza-now-lends-about-kes-6-3-billion-a-day/)

### Inferences
- The fee is a fixed shilling amount per day per band, not a percentage. Its effective rate is therefore extreme on small balances and falls with balance size. At KSh2,501, KSh30 a day is about 1.2% per day; at KSh70,000 it is about 0.04% per day. The calculator must compute Fuliza cost from the band table, not from a rate.
- Whether the 1% access fee also attracts excise is not established.

### Gaps
- No primary Safaricom tariff page for 2026 was read (403).
- No authoritative source was found for the maximum number of days before Fuliza must be repaid or is reported to a credit reference bureau. A commonly cited "30 days" was not confirmed.
- Whether the daily fee is charged on fees (compounding) is not addressed in any source read.

## 6. Regulation on comparison: is APR or TCC the prescribed metric?

### Takeaway
For banks and microfinance banks, CBK and KBA prescribe **Total Cost of Credit, expressed as an APR**, via costofcredit.co.ke and the Banking Act s.31A and CBK/PG/22 disclosure regime. For DCPs, the 2022 Regulations require TCC disclosure (principal plus interest plus fees). No source found prescribes a single method for comparing a 30-day fee product against a multi-year term loan. CBK's own APR is labelled "indicative", and its annualisation formula is unpublished.

### Cited Findings
- On costofcredit.co.ke, "APR is the numerical representation of the Total Cost of Credit". The site's two outputs are TCC and APR, for comparison across banks. — [costofcredit.co.ke glossary](https://costofcredit.co.ke/site/glossary); [costofcredit.co.ke terms](https://costofcredit.co.ke/)
- Banks must publish weighted average lending rates, premiums and fees on the TCC website under the revised RBCPM. — [Business Daily, 29 Jul 2026](https://www.businessdailyafrica.com/bd/corporate/health/uniform-cost-of-credit-as-base-loan-rates-converge-at-8-75pc-5540714)
- DCP Regulations require TCC (principal, interest, fees, charges) disclosure before disbursement. — [money254](https://www.money254.co.ke/post/how-cbk-regulation-affect-borrowers-of-digital-loans-personal-loans); [Kenya Law LN 46/2022](https://new.kenyalaw.org/akn/ke/act/ln/2022/46/eng@2022-04-22)
- The Competition Authority used APR to compare DCPs (280.5% average, 2021 study). That was a study metric, not a rule. — [KIPPRA](https://kippra.or.ke/regulation-of-digital-credit-providers-in-kenya-policy-issues-and-options/)
- A 2026 draft CBK Consumer Protection Framework and a 2026 Microfinance Bill would add disclosure duties. The Bill also adds an in duplum rule. Both are pending. — [CBK framework draft](https://www.centralbank.go.ke/wp-content/uploads/2026/04/Consumer-Protection-Framework-March-2026.pdf); [Bowmans](https://bowmanslaw.com/insights/kenya-microfinance-bill-2026-key-implications-for-microfinance-banks/)
- Third-party commentary: lenders quote daily, monthly or flat-fee terms, so compare on an annualised or total-cost basis. — [paybillke](https://paybillke.com/guides/kenya-loan-apps-effective-apr-2026)

### Inferences
- A consistent basis for the calculator is to present both:
  1. TCC in shillings for the user's actual amount and holding period. This is the regulated concept and the one that is honest for 30-day products.
  2. An APR computed from cash flows on net disbursed cash (an IRR, compounded), with the nominal ×365 figure labelled separately, because Kenyan lenders print the uncompounded version.
- An APR alone misleads for a one-off 30-day need, and a TCC alone misleads across terms.
- s.44A in duplum caps the interest recoverable on a non-performing bank loan at the principal. This is relevant only to a default scenario, and it applies to institutions under the Banking Act (its reach beyond banks is disputed).

### Gaps
- The exact s.31A and CBK/PG/22 wording on APR methodology was not read (CBK host blocked).
- No Competition Authority of Kenya rule (as opposed to a study) prescribing a comparison metric was found.
- No FSD Kenya, MicroSave or CGAP 2025–2026 audit of digital credit pricing was read. Only the 2019 MicroSave report surfaced. — [MicroSave 2019](https://www.microsave.net/wp-content/uploads/2019/09/Digital-Credit-Kenya-Final-report.pdf)
