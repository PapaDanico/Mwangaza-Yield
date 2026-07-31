import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The app takes no Nairobi Securities Exchange data, in any form.
 *
 * That is a legal position, not a preference: the Exchange's terms make its
 * data proprietary and forbid using it to build a product, and what sits
 * publicly on its website is covered as much as a paid feed. Being a small,
 * well-intentioned user is not a licence.
 *
 * The risk is not that someone deliberately reinstates a scraper. It is that a
 * line of copy drifts back — "sources: CBK, NSE, KNBS" in a footer, a helpful
 * link on a placeholder — and the app starts *claiming* a relationship it does
 * not have and must not have. That claim is the exposure, and copy is exactly
 * the kind of thing no other test in this repository looks at.
 *
 * So this asserts the two things that must stay true:
 *   1. nothing fetches, links to, or is configured against nse.co.ke;
 *   2. no user-facing string claims exchange data as a source.
 *
 * Naming the Exchange is still allowed where it is a DISCLAIMER ("not
 * affiliated with"), a REFUSAL (the sources page saying we take nothing), or a
 * plain fact about the market (the glossary explaining where bonds trade).
 * Those protect the reader; a sourcing claim misleads them.
 */

const ROOT = new URL('../../', import.meta.url).pathname;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', 'out', '.git', '__pycache__'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const SOURCE_FILES = walk(join(ROOT, 'src'));
const ALL_FILES = [
  ...SOURCE_FILES,
  ...walk(join(ROOT, 'backend')),
  join(ROOT, '.github/workflows/ci.yml'),
  join(ROOT, 'README.md'),
];

describe('no Nairobi Securities Exchange dependency', () => {
  /**
   * Every other assertion here filters a file list, so an EMPTY list passes all
   * of them. `walk()` reads the filesystem: rename src/, move this file, change
   * the build layout, and this suite goes green while saying nothing at all.
   *
   * That matters more here than anywhere else in the repo. This is not a
   * quality guard, it is the licensing one — the Exchange does not permit free
   * redistribution of its data, which is why every NSE source was removed and
   * the product relies on CBK, Treasury and KNBS releases instead. A guard that
   * silently stops looking is how that comes back: nothing errors, nothing goes
   * red, and the only signal would be a letter.
   *
   * Same defect as the service-worker VERSION, the unwired OG builder and the
   * gold steps the palette never had — a check that cannot fire in the case it
   * exists to detect. It goes first so the rest of the file means something.
   */
  it('is actually looking at files, so nothing below passes vacuously', () => {
    expect(SOURCE_FILES.length, 'walk(src) found nothing — every check below is vacuous').toBeGreaterThan(50);
    expect(ALL_FILES.length, 'the full file list is suspiciously short').toBeGreaterThan(
      SOURCE_FILES.length
    );
    // And the files must be readable, since every assertion below reads them.
    expect(() => ALL_FILES.forEach((f) => readFileSync(f, 'utf8'))).not.toThrow();
  });

  it('nothing anywhere references an nse.co.ke endpoint', () => {
    const offenders = ALL_FILES.filter((f) => /nse\.co\.ke/i.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(ROOT, ''));
    expect(offenders, `these still point at the Exchange:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no exchange-price scraper remains', () => {
    const gone = ['nse_parser.py', 'discover_nse.py', 'discover_secondary_sources.py'];
    const present = walk(join(ROOT, 'backend'))
      .map((f) => f.split('/').pop()!)
      .filter((name) => gone.includes(name));
    expect(present, 'a removed exchange scraper is back').toEqual([]);
  });

  it('no configuration can reinstate an exchange feed', () => {
    const offenders = ALL_FILES.filter((f) => /NSE_DAILY_TRADE_URL|NSE_BONDS_PAGE/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(ROOT, ''));
    expect(offenders, `exchange config survives in:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no user-facing string claims the Exchange as a data source', () => {
    // Phrases that assert sourcing. Deliberately narrow: they match a CLAIM,
    // not any mention. "not affiliated with ... the NSE" is a disclaimer and
    // must keep working.
    const CLAIMS = [
      /\bNSE\b[^.]{0,40}\b(trading )?data\b(?![^.]{0,60}\bno\b)/i,
      /Sources:[^.]*\bNSE\b/i,
      /\bCBK,\s*NSE\b/i,
      /\bNSE\s*(&amp;|&|and)\s*KNBS\b/i,
    ];
    const offenders: string[] = [];
    for (const f of SOURCE_FILES) {
      if (!/\.(tsx?|mdx?)$/.test(f)) continue;
      const text = readFileSync(f, 'utf8');
      for (const claim of CLAIMS) {
        const m = text.match(claim);
        if (m) offenders.push(`${f.replace(ROOT, '')}: ${m[0].slice(0, 80)}`);
      }
    }
    expect(offenders, `sourcing claims found:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('secondary.json ships empty', () => {
    const data = JSON.parse(readFileSync(join(ROOT, 'public/data/secondary.json'), 'utf8'));
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });
});
