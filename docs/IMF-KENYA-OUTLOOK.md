# IMF Kenya outlook — reference note

**Status: SHIPPED since 2026-08-29 as `public/data/imf-outlook.json`.** The
first version of this note said the IMF sat outside the sourcing policy; that
changed once the project's licence registry was found to have already settled
the IMF at `permitted` (`src/lib/licences.ts`, checked 2026-08-16, terms
quoted there) and the two data objections from the original investigation —
unnamed vintages, unflagged projections — were resolved by the shape of the
shipped file. The full decision record is `docs/DATA-SOURCES.md` §22. This
note remains the human-readable companion: the tables, the cross-checks, and
why any of it matters to a bond investor.

House rules for this dataset:

- **The rates feed's contract is unchanged** — no forecasts in `rates.json`,
  and `imf-outlook.json` never feeds it.
- **Nothing here feeds the macro panel or any measured dashboard figure.**
  Measured outturns stay with CBK, the National Treasury, KNBS and the World
  Bank; this layer answers what IMF staff *expect*, never what *is*.
- **Refresh by hand when a WEO edition lands (April / October):** re-pull the
  seven subjects, update `vintageDate`, and re-check the
  outturn/estimate/projection mapping rather than carrying it forward.
  `healthcheck.py` alarms at 240 days of vintage age.

- **Source:** IMF World Economic Outlook (WEO), **April 2026** edition
  (data compiled by IMF staff through 1 April 2026), plus IMF International
  Financial Statistics (IFS) and Balance of Payments (BOP) series.
- **Retrieved:** 29 August 2026, via the IMF data API.
- **Reading the labels:** years marked **e** are IMF estimates, **f** are
  projections. The April 2026 vintage treats 2025 as estimated and 2026
  onward as projected. This mapping is our reading of the vintage, stated in
  each record's `statusNote` — the WEO itself ships one undifferentiated
  year→value map.

## WEO projections, Kenya (April 2026)

| Year | Real GDP growth, % | CPI inflation, avg % | Govt gross debt, % GDP | Fiscal balance, % GDP | Current account, % GDP | Nominal GDP, USD bn | GDP per capita, USD |
|---|---|---|---|---|---|---|---|
| 2020 | −0.3 | 5.3 | 68.0 | −8.1 | −3.7 | 100.9 | 2,068 |
| 2021 | 7.6 | 6.1 | 68.2 | −7.2 | −5.1 | 109.9 | 2,209 |
| 2022 | 4.9 | 7.6 | 67.8 | −6.0 | −5.0 | 114.7 | 2,266 |
| 2023 | 5.7 | 7.7 | 73.4 | −5.6 | −3.6 | 108.2 | 2,099 |
| 2024 | 4.7 | 4.5 | 67.3 | −5.7 | −2.3 | 119.3 | 2,275 |
| 2025 e | 4.9 | 4.1 | 69.3 | −6.4 | −2.7 | 136.5 | 2,558 |
| 2026 f | 4.5 | 5.9 | 71.6 | −6.4 | −4.1 | 147.3 | 2,714 |
| 2027 f | 4.7 | 5.9 | 72.4 | −6.0 | −3.7 | 154.7 | 2,804 |
| 2028 f | 5.1 | 5.7 | 73.3 | −6.0 | −3.4 | 162.0 | 2,887 |
| 2029 f | 5.0 | 5.7 | 73.6 | −6.1 | −3.3 | 171.5 | 3,007 |
| 2030 f | 5.0 | 5.3 | 74.2 | −6.2 | −3.2 | 183.6 | 3,167 |

WEO subject codes: NGDP_RPCH, PCPIPCH, GGXWDG_NGDP, GGXCNL_NGDP,
BCA_NGDPD, NGDPD, NGDPDPC.

## Latest monthly readings (IMF IFS, through June 2026)

| Month | CPI index (all items) | USD/KES, end of period |
|---|---|---|
| 2026-01 | 148.96 | 129.03 |
| 2026-02 | 149.20 | 129.02 |
| 2026-03 | 150.00 | 129.93 |
| 2026-04 | 152.15 | 129.19 |
| 2026-05 | 154.56 | 129.55 |
| 2026-06 | 154.91 | 129.50 |

From the index, year-on-year inflation for June 2026 computes to **6.4%**
(154.91 vs 145.58 in June 2025), after 5.6% in April and 6.7% in May — the
re-acceleration the WEO's 5.9% calendar-2026 average projection implies is
visible in the monthly prints.

Balance of payments (IMF BOP, BPM6, annual): current account balance was
**−$2.12bn in 2024** and **−$2.89bn in 2025**, versus −$3.03bn in 2023.

## Cross-checks against `public/data/`

These are consistency checks only — the app's committed figures remain the
CBK/KNBS/World Bank readings.

| Figure | App value | IMF value | Reading |
|---|---|---|---|
| Real GDP growth 2025 | 4.63% (World Bank, in `macro.json`) | 4.88% (WEO estimate) | Different compilers and vintages; both "around 5%". Worth a look when the World Bank series next updates. |
| Headline inflation | 6.49% y/y, July 2026 (CBK fallback) | 6.4% y/y, June 2026 (derived from IFS index) | Consistent trend; the CBK reading remains the one shown in-app. |
| USD/KES | 129.54 (CBK indicative, 19 Aug 2026) | 129.50 (IFS end-June 2026) | Consistent. |

## Why a bond-yield app keeps this file

Three WEO lines matter directly to what this app helps people decide:

1. **Gross financing pressure.** Debt/GDP bottomed at 67.3% in 2024 and the
   IMF projects it rising every year to 74.2% by 2030, with the fiscal
   deficit stuck near 6% of GDP. Persistent deficits mean persistent
   issuance — the auction calendar this app tracks is not getting quieter.
2. **The 2024 disinflation was not the new level.** Inflation fell to 4.1%
   in 2025 but is projected back near 6% in 2026–27. Real-return maths that
   assumes 4% inflation forever is optimistic on the IMF's numbers.
3. **The shilling assumption.** The 2024 drop in debt/GDP owes much to the
   shilling's recovery from ~156 to ~129 per USD. The WEO projects a widening
   current account deficit from 2026 (−4.1% of GDP), which is the pressure
   point to watch on FX-sensitive external debt service.

## Known gaps in this pull

- **No WEO unemployment series for Kenya** (LUR is not published for KEN).
- **No IFS policy-rate series** (FILR_PA returns no data for Kenya; the CBR
  remains sourced from CBK).
- **IRFCL reserves and FSI banking-soundness queries returned no data** for
  Kenya via the IMF data API on the retrieval date.

*Analytics for education only — not investment advice. Verify against the
IMF's own WEO database before quoting these figures anywhere.*
