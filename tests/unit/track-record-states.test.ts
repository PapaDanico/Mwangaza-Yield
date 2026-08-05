import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Every state the track record can be in must say what it is.
 *
 * The card had three: empty ledger, ranges recorded but none scored yet, and
 * scored. Two carried an explanation and the middle one carried nothing — a
 * bare table of rows reading "awaiting result". That middle state is not an
 * edge case: it is where the card sits from the moment the first range is
 * recorded until the first result publishes, which on the live ledger was five
 * rows and several weeks, and it is the state a shared link lands on.
 *
 * This is a source check rather than a render check because the component
 * imports through `@/`, which the unit runner does not resolve. It is a
 * tripwire, not a proof: it fails if the pending branch is deleted or folded
 * back into the scored one, which is exactly how the gap appeared the first
 * time.
 */
const SRC = readFileSync('src/components/auctions/TrackRecord.tsx', 'utf8');

describe('the track record explains every state it can be in', () => {
  it('has a branch for ranges recorded but not yet scored', () => {
    expect(SRC).toMatch(/s\.claims === 0 && pending > 0/);
  });

  it('does not claim a hit rate in that state', () => {
    // The pending copy sits between its own guard and the table. It must not
    // reach for s.hitRange / s.hitMiddleHalf, which are 0 out of 0 there and
    // would read as five straight misses.
    const start = SRC.indexOf('s.claims === 0 && pending > 0');
    const pendingBlock = SRC.slice(start, SRC.indexOf('<div className="mt-3 overflow-x-auto">', start));
    expect(start).toBeGreaterThan(-1);
    expect(pendingBlock).not.toMatch(/hitRange|hitMiddleHalf/);
  });

  it('still has the empty-ledger copy it always had', () => {
    expect(SRC).toMatch(/Nothing to show yet — and that is deliberate/);
  });
});
