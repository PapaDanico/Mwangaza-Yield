import type { MetadataRoute } from 'next';
import meta from '../../public/data/meta.json';

const BASE = 'https://mwangazayield.org';

const DATA_DRIVEN = [
  '/', '/dashboard', '/auctions', '/yield-curve', '/tbills',
  '/calculator', '/ladder', '/goals', '/portfolio', '/sell', '/feed', '/receipts',
];

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
