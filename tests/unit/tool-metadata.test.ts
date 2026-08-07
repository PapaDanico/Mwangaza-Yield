import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * One source of metadata per route, and it must actually be there.
 *
 * WHY THIS EXISTS
 *
 * Nine interactive routes keep their `metadata` in a per-route `layout.tsx`
 * rather than in `page.tsx`. That is not a quirk: Next.js forbids
 * `export const metadata` from a `'use client'` module, so the metadata was
 * deliberately lifted one level up, and each layout says so.
 *
 * The arrangement is easy to misread as an omission. It was misread on
 * 2026-08-07: while server-rendering the tool pages, the layouts were missed
 * and a second `metadata` export was added to five `page.tsx` files "because
 * they had none". Page metadata OVERRIDES layout metadata, so five curated
 * titles were silently replaced with worse ones — and nothing failed. The
 * build was clean, every test passed, and the only symptom was a different
 * string in a browser tab that nobody was looking at.
 *
 * That is the failure this file exists to make loud: not a missing title, but
 * TWO titles, where the losing one is invisible.
 */

const APP = join(process.cwd(), 'src', 'app');

function routeDirs(): string[] {
  return readdirSync(APP, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => existsSync(join(APP, e.name, 'page.tsx')))
    .map((e) => e.name);
}

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const declaresMetadata = (src: string) => /export const metadata\b/.test(src);

describe('route metadata', () => {
  const routes = routeDirs();

  it('found the routes, so the assertions below are not vacuous', () => {
    expect(routes.length).toBeGreaterThan(15);
  });

  it('never declares metadata in BOTH page.tsx and layout.tsx', () => {
    const doubled = routes.filter((r) => {
      const page = read(join(APP, r, 'page.tsx'));
      const layout = read(join(APP, r, 'layout.tsx'));
      return declaresMetadata(page) && declaresMetadata(layout);
    });
    expect(
      doubled,
      `these routes declare metadata twice — page.tsx silently wins, so the `
        + `layout's title is dead: ${doubled.join(', ')}`,
    ).toEqual([]);
  });

  it('gives every route a title from one place or the other', () => {
    const naked = routes.filter((r) => {
      const page = read(join(APP, r, 'page.tsx'));
      const layout = read(join(APP, r, 'layout.tsx'));
      return !declaresMetadata(page) && !declaresMetadata(layout);
    });
    expect(naked, `routes with no metadata anywhere: ${naked.join(', ')}`).toEqual([]);
  });

  it('keeps the em-dash separator the site uses', () => {
    // Five titles were briefly replaced with "| Mwangaza Yield". A separator
    // is a small thing until half the search results use a different one.
    const wrong: string[] = [];
    for (const r of routes) {
      for (const f of ['page.tsx', 'layout.tsx']) {
        const src = read(join(APP, r, f));
        const m = /title:\s*'([^']*Mwangaza Yield[^']*)'/.exec(src);
        if (m && m[1].includes('|')) wrong.push(`${r}/${f}: ${m[1]}`);
      }
    }
    expect(wrong, `titles using a pipe instead of an em dash: ${wrong.join('; ')}`).toEqual([]);
  });

  it('still has a layout for each interactive route that needs one', () => {
    // If a page becomes a server component its layout could be folded in, but
    // that is a deliberate act. This catches a layout deleted by accident,
    // which would drop the route back to the site-wide default title.
    const clientRoutes = routeDirs().filter((r) => {
      const client = readdirSync(join(APP, r)).filter((f) => /Client\.tsx$/.test(f));
      return client.length > 0 || /'use client'/.test(read(join(APP, r, 'page.tsx')));
    });
    for (const r of clientRoutes) {
      const hasSomewhere =
        declaresMetadata(read(join(APP, r, 'page.tsx')))
        || declaresMetadata(read(join(APP, r, 'layout.tsx')));
      expect(hasSomewhere, `${r} has an interactive page but no metadata anywhere`).toBe(true);
    }
  });
});
