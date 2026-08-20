import type { MetadataRoute } from 'next';
import meta from '../../public/data/meta.json';

/**
 * WHAT IS DELIBERATELY LEFT OUT
 *
 * `/404` — an error page is not content and must never be submitted. Next.js
 * does not add it here, but it is named so nobody adds it back.
 *
 * `/offline` — the service worker's fallback shell, whose entire body is "You
 * are offline" and a list of what still works without a connection. It is a
 * state, not a page. It was added to the STATIC list on 2026-08-19 in the same
 * commit that deleted this paragraph, which is the whole argument for keeping
 * the paragraph: a crawler handed this URL indexes a permanently-wrong page
 * under the site's own brand, and spends crawl budget doing it.
 *
 * `/_debug/pwa` — diagnostics.
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
  '/calculator', '/ladder', '/goals', '/portfolio', '/sell', '/feed', '/receipts', '/macro',
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

  return [
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
}
