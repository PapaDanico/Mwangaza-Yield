# Mwangaza Yield ⛵

**Sovereign yields, crystal clear.** Tax-adjusted yield analytics, auction radar and
portfolio tracking for Kenyan retail bond investors — offline-first, built around CBK's
DhowCSD platform.

**Brand:** gold dhow-sail mark with a rising yield line on treasury navy; earthy light UI
(warm cream/khaki surfaces, navy ink, gold & emerald accents). Type: Plus Jakarta Sans /
Roboto / JetBrains Mono. Regenerate icons and the social card after any logo change:
`node scripts/generate-icons.js && node scripts/generate-og.js`.

## Features

- **Net Yield Calculator** — after-tax returns with Kenyan WHT rules (IFB 0% / ≥10y 10% / <10y 15%),
  Actual/365 accrued interest, dirty price and settlement cost.
- **Auction Radar** — CBK issuance calendar with countdowns, prospectus links and a DhowCSD bidding guide.
- **Portfolio** — CSV import (client-side, stored in IndexedDB — never uploaded), weighted net yield,
  12-month coupon cash-flow calendar.
- **Dashboard** — yield curve, macro panel (CBR, CPI, USD/KES), next-auction banner.
- **PWA** — installable, works fully offline with cached data.

## Stack

Next.js 14 (App Router, static export) · TypeScript · Tailwind · Zustand · Dexie (IndexedDB) ·
Recharts · vanilla service worker. Deployed on **Netlify** (`netlify.toml`: build → `out/`).

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # financial engine unit tests (vitest)
npm run build   # static export to out/
```

## Deploy

**Deploy directly to Netlify.** The git-connected build is the fallback, not
the default — publishing should not depend on GitHub, which it did until an
account-level Actions outage took CI, the data pipeline and the ability to ship
down together.

```bash
node scripts/predeploy-check.mjs   # six gates; exits non-zero and refuses
```

Then ask the Netlify MCP server to deploy and run the one-time command it
returns. It uploads the repo and runs a real build in Netlify's build system,
so the plugins, secret scanning and the generated edge function all still
happen — it is the same build, triggered differently, not a degraded one.

Record the current deploy ID first; it is the rollback target. Full procedure,
post-deploy verification, and the build-credit cost this policy carries:
[`docs/RUNBOOK-DEPLOY.md`](docs/RUNBOOK-DEPLOY.md).

Deploying is not refreshing — a deploy publishes whatever data is committed and
fetches nothing. See
[`docs/RUNBOOK-REFRESH-WITHOUT-CI.md`](docs/RUNBOOK-REFRESH-WITHOUT-CI.md).

## Data pipeline

The app reads static JSON from `public/data/` (bonds, auctions, macro, secondary,
imf-outlook). Scrapers in
`backend/scrapers/` refresh those files twice a day, Monday to Saturday (`17 3,15 * * 1-6`), via
GitHub Actions, which commits the
refreshed files to `main`. Publishing them is a separate step and a separate decision — see
[Deploy](#deploy). **Fail-safe contract:** a scraper that extracts nothing exits
non-zero and leaves the previous file untouched — stale-but-valid beats empty.

`public/data/` holds **live scraped data**, refreshed by that cron and cross-checked in CI
(`published-cross-check`, `schedule-vs-dataset`, `check_archive.py`). Source formats change without
notice, so the `validate-sources` job probes them on every run.

The one exception to the cron is `imf-outlook.json`, which is refreshed **by
hand** when an IMF World Economic Outlook edition lands (April and October);
`healthcheck.py` budgets it at 240 days, so a missed edition raises the same
alert a broken scraper would rather than aging quietly.

### Sourcing: CBK, National Treasury, KNBS and the World Bank — plus a clearly-labelled IMF outlook

⚠️ **No Nairobi Securities Exchange data is used anywhere in this project.** Its terms make the
data proprietary — not copyable, storable or distributable, and not usable to build a product —
and that applies to what sits publicly on its website as much as to a paid feed. Rather than rely
on being a use small enough that nobody minds, the dependency was removed outright: the scrapers
that could once fetch it are deleted, no configuration reinstates them, and no claim to use
exchange data appears anywhere in the app.

`secondary.json` is therefore empty. Anywhere a price is missing, planners fall back to par 100 —
always labelled as a placeholder, never presented as the market (`src/lib/prices.ts`). The price a
reader actually pays is supplied by the reader, in the **price book** (`/prices`): the price paid,
or the one a broker or DhowCSD quotes. It is stored only on their device and takes precedence over
everything else. The `secondary.json` slot remains for a deployer who lawfully holds priced data of
their own.

**The one addition to the four measured sources is the IMF's World Economic
Outlook** — a forecast dataset, kept out of every measured panel by
construction. `public/data/imf-outlook.json` carries the current WEO vintage
for Kenya with the vintage named on every record and each observation labelled
outturn, estimate or projection, under the IMF terms registered as
`permitted` in `src/lib/licences.ts`. It never feeds `rates.json` (whose
no-forecasts contract is unchanged) and never blends with the CBK/KNBS/World
Bank outturns the dashboard quotes. Why it exists and how the two objections
from the original investigation were resolved:
[`docs/DATA-SOURCES.md` §22](docs/DATA-SOURCES.md) and
[`docs/IMF-KENYA-OUTLOOK.md`](docs/IMF-KENYA-OUTLOOK.md).

## Disclaimer

Analytics for education only — not investment advice. Verify all figures against official
CBK and National Treasury publications before investing.
