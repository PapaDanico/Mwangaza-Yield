import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Every route says what it is.
 *
 * Eleven of twenty routes rendered the site-wide title — "Mwangaza Yield —
 * Government bonds, made plain" — in the browser tab, in every bookmark, and to
 * every search engine. The calculator, the ladder, the auction record and the
 * portfolio importer were indistinguishable from the home page and from each
 * other.
 *
 * WHY IT HAPPENED, WHICH IS THE INTERESTING PART
 * ----------------------------------------------
 * It looked like somebody forgetting. It was not. Next.js forbids
 * `export const metadata` from a "use client" module, and the routes without a
 * title were EXACTLY the nine that are interactive. The rule that produced the
 * bug is the same rule that made it look accidental: the pages that most needed
 * their own identity were the ones structurally unable to declare it.
 *
 * A title can therefore come from either place, and this checks for either:
 * the page itself when it is a Server Component, or a sibling layout when the
 * page is a Client Component.
 */

const APP = new URL('../../src/app/', import.meta.url).pathname;

/** Route directories, i.e. every folder holding a page.tsx. */
function routes(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routes(p, acc);
    else if (name === 'page.tsx') acc.push(dir);
  }
  return acc;
}

const DECLARES = /export\s+(const\s+metadata|async\s+function\s+generateMetadata|function\s+generateMetadata)/;

/** The title that means "no title": the root layout's, inherited by default. */
const SITE_WIDE_TITLE = 'Mwangaza Yield — Government bonds, made plain';

const dirs = routes(APP);

/**
 * Source with comments removed.
 *
 * The layouts added for the client routes explain themselves by quoting the
 * site-wide title they used to inherit, so an unstripped scan reports every one
 * of them as an offender — the guard failing on the documentation of the very
 * fix it is guarding. What renders is what gets checked.
 */
const rendered = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

describe('every route carries its own title', () => {
  it('found the routes at all', () => {
    // A scan that walks nothing passes, which is the failure this file exists
    // to prevent.
    expect(dirs.length, 'no page.tsx found under src/app').toBeGreaterThan(15);
  });

  it.each(dirs.map((d) => [d.replace(APP, '') || '(home)', d]))(
    '%s declares metadata on the page or its layout',
    (route, dir) => {
      // The home page is the one route the site-wide title genuinely fits.
      if (route === '(home)') return;

      const page = readFileSync(join(dir, 'page.tsx'), 'utf8');
      const layoutPath = join(dir, 'layout.tsx');
      const layout = existsSync(layoutPath) ? readFileSync(layoutPath, 'utf8') : '';
      const isClient = /^\s*['"]use client['"]/m.test(page);

      const declared = DECLARES.test(page) || DECLARES.test(layout);
      expect(
        declared,
        isClient
          ? `${route} is a Client Component, so it cannot export metadata itself. ` +
              `Add a layout.tsx beside its page.tsx that does — otherwise it ` +
              `inherits the site-wide title and is indistinguishable from the home page.`
          : `${route} is a Server Component with no metadata. Add ` +
              `\`export const metadata\` to its page.tsx.`
      ).toBe(true);
    }
  );

  /**
   * And the titles must actually differ.
   *
   * Declaring metadata is not the same as saying something. A layout that
   * repeated the site-wide string would satisfy the check above while leaving
   * every tab identical — passing the letter of the guard and none of its point.
   */
  it('gives no route the site-wide title as its own', () => {
    const offenders = dirs
      .filter((d) => d.replace(APP, '') !== '')
      .filter((d) => {
        const sources = ['page.tsx', 'layout.tsx']
          .map((f) => join(d, f))
          .filter(existsSync)
          .map(rendered)
          .join('\n');
        return sources.includes(SITE_WIDE_TITLE);
      })
      .map((d) => d.replace(APP, ''));
    expect(
      offenders,
      `these routes restate the site-wide title, so their tabs stay identical ` +
        `to the home page:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });

  it('gives every route a distinct title', () => {
    const titles = new Map<string, string[]>();
    for (const d of dirs) {
      const route = d.replace(APP, '') || '(home)';
      const sources = ['page.tsx', 'layout.tsx']
        .map((f) => join(d, f))
        .filter(existsSync)
        .map(rendered)
        .join('\n');
      const m = sources.match(/title:\s*'([^']+)'/);
      if (!m) continue;
      titles.set(m[1], [...(titles.get(m[1]) ?? []), route]);
    }
    const dupes = [...titles.entries()].filter(([, rs]) => rs.length > 1);
    expect(
      dupes.map(([t, rs]) => `"${t}" on ${rs.join(', ')}`),
      'two routes share a title, so a bookmark cannot tell them apart'
    ).toEqual([]);
  });
});

/** Nothing above is worth much if the directory name changed under it. */
describe('the guard is looking at the real app', () => {
  it('sees the routes the site actually ships', () => {
    const names = dirs.map((d) => d.replace(APP, ''));
    for (const expected of ['calculator', 'ladder', 'auctions', 'portfolio', 'tbills']) {
      expect(names, `route ${expected} vanished from the scan`).toContain(expected);
    }
    expect(dirname(APP)).toContain('src');
  });
});
