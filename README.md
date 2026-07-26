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

## Data pipeline

The app reads static JSON from `public/data/` (bonds, auctions, macro, secondary). Scrapers in
`backend/scrapers/` refresh those files on a weekday cron via GitHub Actions; a push to `main`
triggers Netlify to redeploy. **Fail-safe contract:** a scraper that extracts nothing exits
non-zero and leaves the previous file untouched — stale-but-valid beats empty.

`public/data/` holds **live scraped data**, refreshed by the weekday cron and cross-checked in CI
(`published-cross-check`, `schedule-vs-dataset`, `check_archive.py`). Source formats change without
notice, so the `validate-sources` job probes them on every run.

### Sourcing: CBK, National Treasury, KNBS and the World Bank — and nothing else

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

## Disclaimer

Analytics for education only — not investment advice. Verify all figures against official
CBK and National Treasury publications before investing.
