/**
 * Which macro indicators lead the dashboard, and how many fit across a row.
 *
 * These live apart from MacroPanel for one reason: the component is a client
 * component that reaches into the bond store, so a test cannot import it
 * without dragging the store in. The rule that stops a card being orphaned is
 * worth a test, and a rule that cannot be tested where it lives should move.
 */

/**
 * The headline indicators, and only those.
 *
 * The core and non-core CPI splits live in macro.json beside the headline, but
 * they do not belong here: this is a narrow grid on a 390px screen, and a
 * fourth and fifth card would either overflow or shrink every label past
 * legibility. They are a comparison rather than a reading anyway — the point
 * is the GAP between them — so InflationSplit tells that story instead.
 */
export const HEADLINE: string[] = ['CBR', 'CPI', 'FX_USD_KES', 'GDP'];

/**
 * COLUMNS FOLLOW THE COUNT, BECAUSE THE COUNT IS NOT FIXED.
 *
 * HEADLINE lists four indicators; macro.json currently carries three, so a
 * hard `grid-cols-3` looked right by coincidence. The day a GDP print lands
 * the same grid renders 3 + 1 — one card alone on a second row, stretched to
 * a third of the width with nothing beside it. That is exactly the
 * "unfinished" shape this pass exists to remove, and it would have appeared
 * without any code changing.
 *
 * The four-card phone case is 2x2 rather than four-across: three cards across
 * 390px already leave only ~110px each, and a fourth column takes that to
 * ~80px, below what "USD/KES" plus a figure can hold. Two rows of two keeps
 * every card legible and keeps the block rectangular.
 *
 * Written as whole literal class strings because Tailwind scans source text —
 * a composed `grid-cols-${n}` would not be emitted.
 */
export const COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};
