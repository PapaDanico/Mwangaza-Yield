# Reference data

Public reference documents committed for provenance, so that any figure in the app
can be traced to the source it came from.

## `dhowcsd-securities.csv`

CBK's securities register, exported 25 July 2026 from the **Securities** list on
[DhowCSD](https://dhowcsd.centralbank.go.ke/) — the Central Bank's own depository.

**This is public data, not account data.** The Securities list is reachable from the
landing page *without logging in* — the button sits alongside "Create account", not
behind it. The file contains no account number, no name, no balance and no holding.
Every row is a security the government has issued: issue number, ISIN, issuer, issue
date, maturity date, type, nominal value, currency.

643 securities, of which 157 were outstanding on the export date (59 Treasury bonds,
98 Treasury bills). Maturities run from 2023 to 2056.

It is authoritative for **ISIN, issue date and maturity date**, and
`backend/scrapers/registry.py` reconciles `public/data/bonds.json` against it. It does
**not** publish coupon rates or yields — those still come from prospectuses and auction
results.

Re-export it when new issues appear, and re-run `python backend/scrapers/registry.py`.
