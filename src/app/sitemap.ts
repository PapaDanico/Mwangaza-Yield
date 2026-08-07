import type { MetadataRoute } from 'next';
import meta from '../../public/data/meta.json';

/**
 * There was no sitemap at all. Not a malformed one — none.
 *
 * An external review reported "duplicate /404 entries in the sitemap", which
 * cannot have been describing this repository: there was no sitemap generator,
 * no static sitemap.xml, and nothing in netlify.toml producing one. The real
 * gap was larger than the one reported.
 *
 * WHY IT IS ADDED NOW AND NOT BEFORE
 *
 * Deliberately sequenced after the tool pages began server-rendering their
 * content. Until then `/calculator/`, `/tbills/`, `/sell/`, `/prices/` and
 * `/goals/` emitted a `<main>` with zero characters, and a sitemap advertising
 * five pages that look empty to a crawler is worse than no sitemap: it invites
 * indexing of blank pages and spends crawl budget doing it.
 *
 * WHAT IS DELIBERATELY LEFT OUT
 *
 * `/404` — an error page is not content and must never be submitted. Next.js
 * does not add it here, but it is named so nobody adds it back.
 *
 * `lastModified` uses the pipeline's own `generatedAt` for pages whose content
 * moves with the data, and is omitted elsewhere. A build timestamp on every
 * page would tell a crawler that the whole site changed twice a day, which is
 * false for the glossary and the terms, and teaches it to ignore the field.
 */

const BASE = 'https://mwangazayield.org';

/** Pages whose content genuinely changes when the data refreshes. */
const DATA_DRIVEN = [
  '/', '/dashboard', '/auctions', '/yield-curve', '/tbills',
  '/calculator', '/ladder', '/goals', '/portfolio', '/sell', '/feed',
];

/** Pages that change only when somebody edits them. */
const STATIC = [
  '/about', '/learn', '/glossary', '/faq', '/sources', '/licensing',
  '/support', '/alerts', '/prices', '/privacy', '/terms', '/disclaimer',
];

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const dataStamp = new Date(meta.generatedAt);
  const lastModified = Number.isNaN(dataStamp.getTime()) ? undefined : dataStamp;

  const entries: MetadataRoute.Sitemap = [
    ...DATA_DRIVEN.map((path) => ({
      url: `${BASE}${path}`,
      lastModified,
      changeFrequency: 'daily' as const,
      priority: path === '/' ? 1 : 0.8,
    })),
    ...STATIC.map((path) => ({
      url: `${BASE}${path}`,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),
  ];

  return entries;
}
