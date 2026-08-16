import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The publication gate has to be CALLED, not merely written.
 *
 * `auction-review.ts` spent a long time finished, tested and invisible because
 * its release condition lived in a comment. Turning that comment into
 * `archiveIsPublishable()` only helps if the surface actually consults it —
 * a gate function nobody calls is the same prose it replaced, with more steps.
 *
 * The condition it guards is real: records are never re-derived once written,
 * so a parser-version bump leaves older rows stale until the next run re-reads
 * them, and a median taken mid-rebuild mixes two parsers' output. That is how
 * this module once reported Kenyan auctions as persistently UNDERSUBSCRIBED
 * when they have been the opposite for years.
 *
 * A source check rather than a render check, because the component imports
 * through `@/` which the unit runner does not resolve. It is a tripwire, not a
 * proof — it fails if the guard is deleted or its early return removed, which
 * is exactly how a mid-rebuild median would reach a reader.
 */
const SRC = readFileSync('src/components/auctions/MonthlyReview.tsx', 'utf8');

describe('the monthly review refuses to render from a half-rebuilt archive', () => {
  it('calls the gate and returns nothing when it fails', () => {
    expect(SRC).toMatch(/archiveIsPublishable\([A-Z_]+\)\.ok/);
    expect(SRC).toMatch(/if \(!archiveIsPublishable\([A-Z_]+\)\.ok\) return null;/);
  });

  it('reads the archive statically, not through the store', () => {
    // A store-gated component pre-renders empty under `output: export`. That is
    // how the QEBR panel shipped built, tested and invisible, and repeating it
    // here would reproduce the exact bug this module is finally escaping.
    expect(SRC).toMatch(/from '\.\.\/\.\.\/\.\.\/public\/data\/auction-results\.json'/);
    expect(SRC).not.toMatch(/useBondStore/);
  });

  it('leaves a ratio blank rather than printing one for a switch or tap sale', () => {
    // A switch raises no cash and a tap sale is fixed-price; both sit in the
    // archive at figures like 0.13x that read as failed auctions when nothing
    // failed.
    expect(SRC).toMatch(/row\.bidToCover === undefined \? '—'/);
  });

  it('states its evidence base on the card itself', () => {
    expect(SRC).toMatch(/evidenceLine\(r\)/);
  });
});
