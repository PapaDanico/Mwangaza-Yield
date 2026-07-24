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

⚠️ `public/data/` currently contains a **sample dataset**. Before launch, validate each scraper
against the live CBK/NSE sources (formats change without notice) and set the
`NSE_DAILY_TRADE_URL` repository variable.

## Disclaimer

Analytics for education only — not investment advice. Verify all figures against official
CBK/NSE publications before investing.
