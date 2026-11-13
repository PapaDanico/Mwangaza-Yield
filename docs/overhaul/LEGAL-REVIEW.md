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

When the extras are posted (first run 14 Nov 06:45 UTC; eight documents per run), read the `gapdocs` field with the Netlify MCP, update the pages only for what the text states, and add the reading to `CLAUDE.md`.
