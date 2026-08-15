import { describe, expect, it } from 'vitest';
import { COLUMNS, HEADLINE } from '../../src/lib/macro-headline';

/**
 * THE ORPHAN CARD.
 *
 * MacroPanel renders however many of HEADLINE's indicators macro.json happens
 * to carry. It carried three, and the grid was a hard `grid-cols-3`, so the
 * layout looked deliberate by coincidence. A GDP print landing would have
 * rendered 3 + 1 — one stretched card alone on a second row — with no code
 * changing and no test failing.
 *
 * This asserts the column rules cover every count the component can actually
 * be handed. Add a fifth indicator to HEADLINE without a matching rule and
 * this fails, which is the only mutation worth guarding here.
 */
describe('MacroPanel column rules', () => {
  it('covers every card count HEADLINE can produce', () => {
    for (let n = 1; n <= HEADLINE.length; n++) {
      expect(COLUMNS[n], `no column rule for ${n} card(s)`).toBeTruthy();
    }
  });

  it('never puts more than three cards across a 390px phone', () => {
    for (let n = 1; n <= HEADLINE.length; n++) {
      // The base (unprefixed) column count is what a phone gets.
      const base = COLUMNS[n].split(' ').find((c) => c.startsWith('grid-cols-'))!;
      const across = Number(base.replace('grid-cols-', ''));
      expect(across, `${n} cards would be ${across} across on a phone`).toBeLessThanOrEqual(3);
    }
  });
});
