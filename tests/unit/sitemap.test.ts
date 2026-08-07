import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sitemap from '../../src/app/sitemap';

/**
 * A sitemap is a promise to a crawler, and a promise it can check.
 *
 * Two failure modes matter, and neither shows up in a browser:
 *
 *   a route exists and the sitemap omits it   — it goes unindexed
 *   the sitemap lists a route that is gone    — the crawler gets a 404 from us
 *
 * Both are silent. So the list is checked against the routes on disk rather
 * than trusted, and a new page under src/app fails here until it is either
 * listed or explicitly excluded.
 */

const APP = join(process.cwd(), 'src', 'app');

/** Every route segment that actually builds to a page. */
function routesOnDisk(): string[] {
  return readdirSync(APP, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => existsSync(join(APP, e.name, 'page.tsx')))
    .map((e) => `/${e.name}`);
}

/**
 * Routes deliberately absent from the sitemap, each with a reason.
 *
 * Empty today. It exists so that excluding a page is a decision somebody
 * writes down, rather than an omission indistinguishable from forgetting.
 */
const DELIBERATELY_EXCLUDED: Record<string, string> = {};

const entries = sitemap();
const paths = entries.map((e) => new URL(e.url).pathname.replace(/\/$/, '') || '/');

describe('the sitemap', () => {
  it('is not empty, so the assertions below mean something', () => {
    expect(entries.length).toBeGreaterThan(15);
  });

  it('lists every route that exists on disk', () => {
    const missing = routesOnDisk()
      .filter((r) => !paths.includes(r))
      .filter((r) => !(r in DELIBERATELY_EXCLUDED));
    expect(missing, `routes on disk but absent from the sitemap: ${missing.join(', ')}`).toEqual([]);
  });

  it('lists no route that does not exist', () => {
    const onDisk = new Set([...routesOnDisk(), '/']);
    const ghosts = paths.filter((p) => !onDisk.has(p));
    expect(ghosts, `sitemap lists routes with no page.tsx: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('never lists an error page', () => {
    // An error page is not content. A review reported duplicate /404 entries
    // in a sitemap this repository did not yet have; if one is ever added by
    // hand or by a generator, this is where it stops.
    for (const p of paths) {
      expect(p).not.toMatch(/^\/(404|500)$/);
    }
  });

  it('contains no duplicates', () => {
    expect(paths.length).toBe(new Set(paths).size);
  });

  it('uses one absolute origin throughout', () => {
    // A relative or mixed-origin sitemap is silently ignored by crawlers.
    for (const e of entries) {
      expect(e.url).toMatch(/^https:\/\/mwangazayield\.org\//);
    }
  });

  it('dates only the pages the data actually moves', () => {
    // Stamping every page on each build tells a crawler the glossary changes
    // twice a day. It does not, and a field that is always wrong gets ignored.
    const dated = entries.filter((e) => e.lastModified);
    const undated = entries.filter((e) => !e.lastModified);
    expect(dated.length).toBeGreaterThan(0);
    expect(undated.length).toBeGreaterThan(0);
    expect(paths.filter((p) => ['/glossary', '/terms', '/privacy'].includes(p)).length)
      .toBeGreaterThan(0);
    for (const e of entries) {
      const p = new URL(e.url).pathname.replace(/\/$/, '') || '/';
      if (['/glossary', '/terms', '/privacy', '/about'].includes(p)) {
        expect(e.lastModified, `${p} should not carry a build timestamp`).toBeUndefined();
      }
    }
  });

  it('gives the home page the highest priority', () => {
    const home = entries.find((e) => new URL(e.url).pathname === '/');
    expect(home?.priority).toBe(1);
  });
});
