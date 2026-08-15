import type { MetadataRoute } from 'next';
import { APP_URL } from '@/lib/share';

/**
 * There was no robots.txt at all.
 *
 * Its absence does not block crawling — an absent file is read as "crawl
 * everything" — so this is not a fix for a site that was invisible. What it
 * adds is the Sitemap: line. sitemap.xml has been generated all along and
 * nothing pointed at it, so a crawler could only find the 23 routes by
 * following links inward from whatever it happened to discover first. Handing
 * it the list is the difference between being crawlable and being enumerated.
 *
 * /data/ is left crawlable on purpose. It holds rates.json and rates.csv, the
 * published feed, and those are the artefact this project wants found and
 * cited rather than hidden. The sister project disallows its /api/ because
 * that is machinery; a published dataset is not.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
