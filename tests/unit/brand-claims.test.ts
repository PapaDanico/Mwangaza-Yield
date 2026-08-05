import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Claims this product does not make.
 *
 * A brand pack arrived carrying a banner for "Real-time Kenya sovereign yield
 * curves". It reads well and it is false about the mechanism, not merely
 * optimistic about it: every figure here is a committed snapshot of a
 * published CBK auction, refreshed daily and dated on the page. Nothing
 * streams, and there is no market feed to stream from — the sourcing policy
 * publishes no exchange-sourced or secondary-market prices at all.
 *
 * The codebase was clean when the pack arrived. That is the argument for
 * writing this now rather than later: nothing was stopping the sentence from
 * being pasted in, and a nicer sentence is how a compliance problem enters a
 * repository — not by anyone deciding to make a claim.
 *
 * Two places already say the right thing in comments — `bond.ts` calls
 * ytmGross "not a live market yield" and YieldCurveChart repeats it — which is
 * exactly why the scan strips comments before matching. A guard that flags the
 * note explaining the rule teaches people to delete the note.
 */
const FORBIDDEN: { pattern: RegExp; because: string }[] = [
  {
    pattern: /\breal[-\s]?time\b/i,
    because:
      'every figure is a dated snapshot of a published auction, refreshed daily; nothing here streams',
  },
  {
    /* Intervening words allowed, because one word defeated the old pattern.
     *
     * This read `live\s+(market|rates|yields|…)` — adjacent only. The channel
     * description written for Pesa Smart KE says "Live, after-tax yields on
     * Treasury Bills & Bonds", and that sailed through: "after-tax" sits
     * between "Live" and "yields" and the guard never fired. It is the same
     * claim the brand pack was rejected for ("Real-time Kenya sovereign yield
     * curves"), reworded just enough to slip past.
     *
     * The lookahead keeps ordinary uses of the verb out — "people who live in
     * Kenya pay rates", "live from Nairobi, the rates are" — which is why the
     * intervening span is bounded and prepositions are excluded rather than
     * matching anything within N characters. */
    pattern:
      /\blive\b[,\s]+(?!in\b|on\b|at\b|with\b|for\b|near\b|from\b|and\b)(?:[a-z-]+[,\s]+){0,2}(?:market|rates?|prices?|yields?|curves?)\b/i,
    because:
      'implies a tradeable price, and the sourcing policy publishes no market prices at all',
  },
  {
    pattern: /\bguaranteed\s+(?:returns?|yields?|profits?)\b/i,
    because: 'no return here is guaranteed, and saying so is regulated language in Kenya',
  },
  {
    pattern: /\bgrow\s+(?:your|their)\s+(?:money|savings|wealth)\b/i,
    because: 'promises a return on money placed, which is a licensed activity and not this one',
  },
];

const ROOT = new URL('../../', import.meta.url).pathname;

const shipped = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

describe('the product does not make claims it cannot support', () => {
  /* `--others --exclude-standard` as well as the index, because a file that is
   * not yet committed is exactly when this guard matters most.
   *
   * The scan was `git ls-files` alone, which lists only TRACKED files. A newly
   * written page is untracked, so it was invisible: the suite ran green on a
   * machine where the offending sentence was sitting in the working tree, and
   * only turned red in CI after the commit made the file tracked. That is the
   * worst possible order — the author sees green, review sees red, and the
   * feedback arrives after the work is packaged.
   *
   * It happened on src/app/yield-curve/page.tsx, whose "not live market
   * prices" disclaimer trips the pattern (the regex cannot read a negation,
   * and loosening it to accept one would be the wrong repair — the phrase is
   * avoidable and the guard should stay blunt).
   *
   * `--exclude-standard` keeps .gitignore honoured, so node_modules and out/
   * do not enter the scan. */
  const files = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      'src/*.ts',
      'src/*.tsx',
      'public/data/*.json',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean);

  it('scans a real file list, not an empty one', () => {
    // A guard over zero files passes forever, which is the failure mode that
    // makes a green suite worse than no suite.
    expect(files.length, 'git ls-files returned nothing — the scan is vacuous').toBeGreaterThan(30);
    expect(files.some((f) => f.startsWith('src/components/'))).toBe(true);
  });

  for (const { pattern, because } of FORBIDDEN) {
    it(`never says ${pattern.source}`, () => {
      const offenders: string[] = [];
      for (const f of files) {
        let src: string;
        try {
          src = readFileSync(`${ROOT}${f}`, 'utf8');
        } catch {
          continue;
        }
        const m = shipped(src).match(pattern);
        if (m) offenders.push(`${f}: "${m[0].trim()}"`);
      }
      expect(offenders, `${because}\n  ${offenders.join('\n  ')}`).toEqual([]);
    });
  }

  it('would catch the banner it was written for', () => {
    // A scanner that matches nothing is indistinguishable from a clean
    // codebase, and on the day this was written the two were the same thing.
    for (const c of [
      'Real-time Kenya sovereign yield curves',
      'realtime auction data',
      'live yields from the NSE',
      'guaranteed yields of 14%',
    ]) {
      expect(
        FORBIDDEN.some((f) => f.pattern.test(c)),
        `"${c}" would have passed the brand guard`
      ).toBe(true);
    }
  });

  it('does not fire on the comments that deny these very claims', () => {
    /* bond.ts and YieldCurveChart both say "not a live market yield" on
     * purpose, and that sentence is doing useful work. If the scan flagged it,
     * the cheapest repair would be deleting the clarification — turning a
     * guard against overclaiming into a machine for removing caveats. */
    const src = 'const x = 1; /* ytmGross is not a live market yield */';
    expect(FORBIDDEN.some((f) => f.pattern.test(shipped(src)))).toBe(false);
    expect(FORBIDDEN.some((f) => f.pattern.test(src))).toBe(true);
  });

  /* The exact string that got past the old pattern, pinned as a case.
   *
   * "Live, after-tax yields on Treasury Bills & Bonds" was written for the
   * WhatsApp channel description while both repositories carried a guard
   * against precisely this claim. One word — "after-tax" — sat between "Live"
   * and "yields" and the adjacency requirement did the rest.
   *
   * Worth keeping as a literal rather than trusting the regex to stay right:
   * the next person to simplify this pattern will not know which phrasing it
   * was widened for. */
  it('catches the wording that actually evaded it', () => {
    const evasions = [
      'Live, after-tax yields on Treasury Bills & Bonds',
      'Live after-tax yields',
      'live daily rates',
    ];
    for (const text of evasions) {
      expect(
        FORBIDDEN.some(({ pattern }) => pattern.test(text)),
        `"${text}" should be caught — it is the real-time claim in different clothes`
      ).toBe(true);
    }
  });

  /* Ordinary uses of the verb, which must stay legal. A guard that fires on
   * "people who live in Kenya" gets switched off. */
  it('leaves the ordinary verb alone', () => {
    const innocent = [
      'people who live in Kenya pay rates on their savings',
      'live from Nairobi, the rates are published each Thursday',
      'we live and breathe rates',
    ];
    for (const text of innocent) {
      const hit = FORBIDDEN.find(({ pattern }) => pattern.test(text));
      expect(hit?.because, `"${text}" is not a claim about market data`).toBeUndefined();
    }
  });
});
