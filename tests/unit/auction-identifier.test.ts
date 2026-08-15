import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE ARROW THAT POINTED AT NOTHING.
 *
 * AuctionBanner rendered `{next.issueCode} · {next.bondName}` as one paragraph
 * under `-webkit-line-clamp: 2`. Sharing a clamp means sharing a budget, and a
 * budget is spent in reading order — so the identifier, being first, was first
 * to be cut. Measured at 390px the card read
 *
 *     FXD1/2012/015 + bills →…
 *
 * against a full value of "FXD1/2012/015 + bills → FXD4/2019/010": six of eight
 * lines hidden, and the hidden part was the bond being switched INTO, which is
 * the whole content of a switch auction. The clamp was not too tight; it was
 * pointed at the wrong field.
 *
 * WHY THIS IS A SOURCE SCAN
 *
 * The rendering is the thing that broke, and this repo has no browser test
 * runner — tests/e2e holds one smoke script. A scan cannot prove the text fits,
 * but it can hold the decision that made it fit: the identifier is rendered
 * alone, and it is not clamped or truncated. Both mutations that reintroduce
 * the defect — merging the fields back together, or putting a clamp back on the
 * code — fail here. It is deliberately narrow about what it claims.
 */
const SRC = join(process.cwd(), 'src/components/dashboard/AuctionBanner.tsx');

/** The JSX element that renders `expr`, from its opening `<p` to its `</p>`. */
function elementRendering(source: string, expr: string): string {
  const at = source.indexOf(expr);
  expect(at, `${expr} is not rendered by AuctionBanner at all`).toBeGreaterThan(-1);
  const open = source.lastIndexOf('<p', at);
  const close = source.indexOf('</p>', at);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  return source.slice(open, close);
}

describe('the auction identifier survives the banner', () => {
  const source = readFileSync(SRC, 'utf8');

  it('renders the issue code in an element of its own', () => {
    const el = elementRendering(source, '{next.issueCode}');
    expect(
      el.includes('{next.bondName}'),
      'issueCode and bondName share an element again, so they share a clamp budget ' +
        'and the identifier is cut first — this is exactly the defect',
    ).toBe(false);
  });

  it('never clamps or truncates the issue code', () => {
    const el = elementRendering(source, '{next.issueCode}');
    for (const banned of ['line-clamp', 'truncate', 'text-ellipsis']) {
      expect(
        el.includes(banned),
        `the issue code carries "${banned}"; a cut identifier is worse than a tall card`,
      ).toBe(false);
    }
  });

  it('still clamps the descriptive name, which is what may yield', () => {
    // The cap itself was correct and is worth keeping: an unbounded name would
    // push the macro strip further below the fold than it already sits.
    const el = elementRendering(source, '{next.bondName}');
    expect(el).toMatch(/line-clamp/);
  });
});
