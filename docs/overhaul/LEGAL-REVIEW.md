# Legal pages and regulatory position, 13 Nov 2026

Evidence report: `reports/Kenya securities fees and regulation.md` (six-angle research, search-summary based; the sandbox cannot fetch Kenya Law, ODPC, KRA or CMA). Nothing here is legal advice and none of it has been reviewed by counsel. Where a point is unresolved it is stated as a fact with the document that settles it, and `netlify/functions/cbk-gaps.mts` has been pointed at those documents (it runs daily at 06:45 UTC from Netlify, where egress is open, and posts windows of text to the `gapdocs` field of the `cbk-watch` form).

## Decisions taken (no owner input needed)
- **Architecture stays as is.** Every data-protection duty found attaches to personal data held by the operator; the product holds none server-side. No server-side logging of IPs or identifiers is to be added (pinned by `no-server-personal-data.test.ts`).
- **Pages say only what is verified.** The privacy, terms, disclaimer and about pages (13 Nov) disclose offshore hosting, make no claim about ODPC registration or exemption, make no funding claim, and describe tools as educational, non-transacting and not tailored beyond the numbers entered.
- **Buy-side charges:** the calculator takes an optional user-entered charge, default 0. No CBK fee for bidding on DhowCSD was found (unverified, so the field says "check DhowCSD's current terms"). No bank or broker tariff and no secondary-market levy is published, because the only figures found are 2013-2025 and conflict by a factor of ten.
- **Tax defaults unchanged:** 15% under ten years, 10% at ten or more, 0% infrastructure bonds, 15% on bills. The "T-bills are tax-exempt for individuals" claim is not adopted: no statute or KRA notice found supports it.

## Unresolved facts, and the document that settles each
| Point | State | Settled by |
|---|---|---|
| Secondary bond commission, levies, commencement | Fifth Schedule of LN 197/2025 exists; percentages unread | `cbk-gaps` extra: Kenya Law LN 197 of 2025 |
| Does "investment adviser" reach a free non-transacting calculator | 2025 Regulations extend it to algorithmic platforms; no source says calculators are in or out | same LN 197/2025 definitions |
| DhowCSD / M-Pesa fees | none found | `cbk-gaps` extras: CBK DhowCSD FAQ and Investor Portal T&Cs |
| WHT by tenor, bill discount, infrastructure exemption, Finance Act 2026 | market practice only; no statute text read | `cbk-gaps` extras: Income Tax Act, Finance Act 2026 |
| ODPC registration exemption (turnover < KES 5m and < 10 staff) and whether a site with no server-side personal data must register | exemption reported; applicability unconfirmed | `cbk-gaps` extras: ODPC registration and MSME guidance notes |
| Cross-border guidance: final or draft, scope for static-host logs | reported final 8 Sept 2026; PDF path may be the April draft | `cbk-gaps` extra: ODPC cross-border guidance note |
| Data Protection (Amendment) Bill 2025 | treated as not enacted; no stage found | National Assembly order papers (no URL) |
| ODPC register entry for Danico Ventures Ltd | not found by search; the register is not indexed | dataportal.odpc.go.ke |

## First reading, 14 Nov 2026 (06:45 UTC run)
Five of the eight documents posted; three were lost and the windows on two were wrong. What the text states, and nothing more:
- **ODPC registration note:** a certificate is issued within 14 days of application and payment and is valid two years; a change in particulars must be notified within 14 days; processing personal data without registering, or continuing after expiry, is an offence; a controller that is also a processor registers twice. The text shows an entity with turnover over KES 5m but under 10 employees paying KES 4,000, and says an entity that meets only part of the exemption conditions is not exempt. **The opening of the exemption test, and the list of activities that are never exempt, were cut off**, so whether a static site with no server-side personal data must register is still unconfirmed. No page claims registration or exemption, and none should until that is read.
- **ODPC cross-border note:** the compliance checklist asks for a lawful basis, a data processing agreement with the provider, documented safeguards, and review of provider terms and sub-processors. The window did not reach any passage on static hosting or server logs, nor the note's date or status. The privacy pages already disclose Netlify's possible offshore processing; nothing here changes them.
- **ODPC MSME note:** registration and data mapping (records of processing) are named as compliance obligations for any entity processing personal data. Nothing specific to calculators.
- **CBK Investor Portal T&Cs:** transaction fees for the app are "subject to change at any time at the MNO's sole discretion" and the customer pays them; no figure is stated. The buy-side charge field therefore stays user-entered with no default.
- **Income Tax Act (Cap 470, Rev. 2017):** the window landed on employment-benefit and turnover-tax sections. Nothing on withholding tax was read, so the 15% / 10% / 0% defaults are unchanged and still unconfirmed against the text.
- **Not read:** LN 197/2025, the DhowCSD FAQ and Finance Act 2026. `cbk-gaps` joined every document of a run into one body cut at 38,000 characters and then marked all of them read, so these were dropped for good. Fixed 14 Nov: one submission per document, each marked read only after its own post; the phrases and window widths for the registration, cross-border, Income Tax Act, Finance Act, LN 197, DhowCSD and Investor Portal documents were revised, and a changed phrase list changes the read key, so all seven are read again on the 15 Nov 06:45 UTC run (the eighth slot of the run is unused).

Next reading: 15 Nov 06:45 UTC. Read the `gapdocs` field with the Netlify MCP, update the pages only for what the text states, and add the reading to `CLAUDE.md`.
