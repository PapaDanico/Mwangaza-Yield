/**
 * A module nobody can reach is a feature nobody can use.
 *
 * WHY THIS EXISTS
 * ---------------
 * Twice now a module has been designed, implemented, documented and tested,
 * and then imported by nothing. The QEBR panel computed the sovereign figures
 * correctly while the app went on showing World Bank numbers two years stale —
 * reserves at 4.03 months against a real 6.4, current account at -1.29% against
 * -3.0%, both flattering the borrower. `real-history.ts` shipped complete with
 * a decade of arithmetic nobody could see.
 *
 * Neither was caught by a test, because every test passed. Unit tests import
 * the module directly, so a module with no other callers looks exactly as
 * healthy as one wired into every page. Coverage tools agree with them. The
 * build succeeds, the lint is clean, and the work is invisible.
 *
 * Both were found by accident, and finding a thing twice by accident is the
 * signal to stop relying on accident.
 *
 * WHAT THIS CHECKS
 * ----------------
 * It walks the import graph from every file under `src/app` — the routes, which
 * are the only way a reader reaches anything — and reports which modules under
 * `src/lib` and `src/components` are never reached. Anything unreachable must
 * be on ALLOWED below with a stated reason, or this fails.
 *
 * The allowlist is the point, not an escape hatch: it forces the answer to
 * "why does this exist if nothing uses it?" to be written down at the moment
 * the situation is created, rather than reconstructed months later by someone
 * wondering whether deleting it is safe.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';

const ROOT = process.cwd();

/**
 * Modules that are legitimately unreachable from a page, and why.
 *
 * A reason must say what DOES consume the module, or what has to happen before
 * something does. "Not used yet" is not a reason.
 */
const ALLOWED: Record<string, string> = {
  'src/lib/engine.ts':
    'The licensable calculation engine (M2). Consumed by scripts/build-engine.mjs, ' +
    'scripts/engine-smoke.mjs and scripts/build-rates-feed.mjs, which package it for ' +
    'external licensees. It is deliberately independent of the app so a licensee ' +
    'takes the arithmetic without the UI.',
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p);
  }
  return out;
}

const FILES = walk(join(ROOT, 'src')).map((f) => f.replace(ROOT + '/', ''));
const SRC = new Map(FILES.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));

/** Resolve an import specifier to a file in the tree, or null for a package. */
function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join('src', spec.slice(2));
  else if (spec.startsWith('.'))
    base = resolve(dirname(join(ROOT, from)), spec).replace(ROOT + '/', '');
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (SRC.has(c)) return c;
  }
  return null;
}

// Static imports, type-only imports, and dynamic import() alike — a module
// reached by a lazy import is reached.
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function reachable(): Set<string> {
  const entries = FILES.filter((f) => f.startsWith('src/app/'));
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of (SRC.get(f) ?? '').matchAll(IMPORT_RE)) {
      const target = resolveSpec(f, m[1]);
      if (target) stack.push(target);
    }
  }
  return seen;
}

describe('the reachability sweep', () => {
  const REACHED = reachable();

  it('actually traversed the app', () => {
    // A graph walk that finds nothing, or only the entry points, would pass the
    // real assertion below while checking nothing at all.
    const entries = FILES.filter((f) => f.startsWith('src/app/'));
    expect(entries.length).toBeGreaterThan(20);
    expect(REACHED.size).toBeGreaterThan(entries.length * 2);
    // Sanity: a module known to be wired must come out reachable. If this ever
    // fails, the resolver is broken and every other result here is noise.
    expect(REACHED.has('src/lib/tbills.ts')).toBe(true);
    expect(REACHED.has('src/lib/sovereign-record.ts')).toBe(true);
  });

  it('leaves no module unreachable without a stated reason', () => {
    const orphans = FILES.filter(
      (f) =>
        !REACHED.has(f) &&
        (f.startsWith('src/lib/') || f.startsWith('src/components/')) &&
        !(f in ALLOWED)
    );
    expect(
      orphans,
      'These are built but no page can reach them. Either wire them in, delete ' +
        'them, or add them to ALLOWED with a reason saying what does consume ' +
        'them. A module nobody can reach is a feature nobody can use, and every ' +
        'one of its tests will still pass.'
    ).toEqual([]);
  });

  it('keeps the allowlist honest', () => {
    // An entry for a module that is now wired in, or has been deleted, is a
    // standing exemption waiting to excuse the next orphan.
    for (const [file, reason] of Object.entries(ALLOWED)) {
      expect(SRC.has(file), `ALLOWED lists ${file}, which no longer exists.`).toBe(true);
      expect(
        REACHED.has(file),
        `ALLOWED lists ${file}, but it IS reachable now — delete the entry.`
      ).toBe(false);
      expect(reason.length, `${file} needs a real reason, not a placeholder.`).toBeGreaterThan(60);
    }
  });
});
