/** One definition of the class string every form control on the site shares.
 *
 * This existed six times — in goals, ladder, prices, calculator, tbills and
 * sell — as six identical local `inputCls` constants. Identical, that is,
 * except for the one that mattered: `/prices` alone carried `min-h-11`, and
 * so `/prices` alone had 44px-tall inputs. Somebody found the touch-target
 * problem, fixed it correctly, and the fix could not travel, because there
 * was nowhere for it to travel to.
 *
 * Measured at 390px before this change: the other five pages served inputs
 * 40–42px tall — short enough to miss, close enough to look fine, and
 * invisible to any check that reads one file at a time.
 *
 * `min-h-11` is 2.75rem = 44px, the smallest target a thumb hits reliably.
 * Keep it. If a control needs to be smaller, it needs to justify that at its
 * own call site rather than by quietly forking this string a seventh time.
 */
export const inputCls =
  'min-h-11 w-full rounded-xl border border-sand-400 bg-sand-50 px-3 py-2 text-sm text-ink outline-none focus:border-gold-500';

/** The label that sits above a control styled with {@link inputCls}. */
export const labelCls = 'mb-1 block text-sm font-medium text-ink-soft';
