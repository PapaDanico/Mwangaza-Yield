import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import resolveConfig from 'tailwindcss/resolveConfig';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import tailwindConfig from '../../tailwind.config.js';

/**
 * Every brand colour utility in the source must name a step that exists.
 *
 * Tailwind emits NOTHING for an undefined step. `text-gold-400` against a
 * palette holding 300/500/600/700 does not warn, does not fail the build and
 * does not fall back — the class simply produces no rule, the element keeps
 * whatever it inherited, and the page renders.
 *
 * That had happened in twelve places before anybody noticed one of them. The
 * one noticed was the footer's Pesa Smart channel link, reported as "not
 * visible": dark inherited ink on the navy footer. The worst was quieter —
 * PriceProvenance's stale-figure badge is `bg-gold-100 text-gold-800`, both
 * undefined, so a caution badge rendered as ordinary body copy for as long as
 * it has existed. A warning that stops looking like a warning is worse than no
 * warning, and nothing in the suite, the build or the type-checker could see it.
 *
 * This is the same failure shape as the service-worker VERSION and the unwired
 * OG builder: a derivative silently disagreeing with its source, with the
 * checking left to whoever happened to look at the page. So the palette is now
 * checked against its callers rather than assumed to cover them.
 *
 * If this fails, you have two honest fixes: add the step to tailwind.config.js
 * if the design wants it, or change the class to a step that exists. Do not
 * add the class to an ignore list — an invisible element is what that buys.
 */
const ROOT = new URL('../../', import.meta.url).pathname;

/** Only the scales we define. Tailwind's own (slate, red…) survive `extend`. */
const OURS = ['gold', 'sand', 'mint'] as const;

const PREFIXES = [
  'text', 'bg', 'border', 'from', 'to', 'via', 'ring', 'fill', 'stroke',
  'decoration', 'outline', 'shadow', 'divide', 'placeholder', 'accent', 'caret',
].join('|');

/* Matches `hover:border-gold-400`, `bg-gold-50/40`, `text-gold-800`. The
 * variant and the opacity suffix are both ignored — neither changes whether
 * the underlying step resolves. */
const UTILITY = new RegExp(`\\b(?:${PREFIXES})-(${OURS.join('|')})-(\\d{2,3})\\b`, 'g');

function sources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) sources(path, acc);
    else if (/\.tsx?$/.test(path)) acc.push(path);
  }
  return acc;
}

describe('the colour palette covers every utility that uses it', () => {
  /* Through `unknown` deliberately. resolveConfig's return type is generic over
   * the config it is given, and tailwind.config.js is a plain CommonJS module
   * with no `satisfies Config`, so TS infers `never` for the theme and a direct
   * cast is an error. The runtime shape is what this test actually asserts. */
  const theme = resolveConfig(tailwindConfig as never).theme as unknown as {
    colors: Record<string, Record<string, string>>;
  };
  const files = sources(`${ROOT}src`);

  it('found sources and scales to check, so the guard is not vacuous', () => {
    expect(files.length, 'no source files found').toBeGreaterThan(50);
    for (const scale of OURS) {
      expect(Object.keys(theme.colors[scale] ?? {}).length, `${scale} missing`).toBeGreaterThan(2);
    }
  });

  it('names no step that Tailwind would drop on the floor', () => {
    const missing: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const [utility, scale, step] of src.matchAll(UTILITY)) {
        if (theme.colors[scale]?.[step] === undefined) {
          missing.push(`${file.slice(ROOT.length)}: ${utility}`);
        }
      }
    }
    expect(
      missing,
      [
        'These utilities name a colour step that is not in tailwind.config.js.',
        'Tailwind emits no rule for them, so the element renders with whatever',
        'it inherited — invisible text on a dark surface, or a badge with no',
        'badge. Add the step to the palette, or use one that exists.',
      ].join(' ')
    ).toEqual([]);
  });

  it('catches an undefined step when one is introduced', () => {
    /* Mutation check, in both directions: the assertion above is only worth
     * having if it can actually fire. The palette has no gold-950. */
    expect(theme.colors.gold['950' as never]).toBeUndefined();
    expect('text-gold-950'.match(UTILITY)).not.toBeNull();
    expect('text-gold-500'.match(UTILITY)).not.toBeNull();
    expect(theme.colors.gold['500']).toBeDefined();
  });
});
