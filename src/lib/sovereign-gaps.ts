/**
 * Which sovereign indicators we ask for and do not get.
 *
 * WHY AN ABSENCE NEEDS NAMING
 * ---------------------------
 * `SovereignContext` renders whatever `context.json` contains. That is the
 * right behaviour for a panel fed by a pipeline where any single indicator may
 * be missing on any given run — but it means a permanently absent indicator is
 * indistinguishable from one nobody thought to include.
 *
 * One is permanently absent, and it is the one a reader would look for first.
 * `worldbank.py` asks for **Government debt / GDP** (`GC.DOD.TOTL.GD.ZS`) and
 * the World Bank answers 200 with no observation for Kenya — its own comment
 * records this. Seven of the eight indicators arrive; the eighth never has.
 *
 * So the panel currently answers "Can the borrower pay?" with seven ratios and
 * silently omits the single most quoted measure of exactly that. A reader who
 * knows the metric assumes we did not think of it. A reader who does not is
 * left with a more comfortable picture than the data supports, because the
 * indicator most likely to look bad is the one that vanished.
 *
 * Saying "we ask for this and cannot get it, here is where to find it" is the
 * same standard the rest of the site holds: /tbills/ states outright that it
 * publishes no secondary-market prices rather than leaving a reader to notice.
 *
 * WHY THIS IS COMPUTED, NOT HARD-CODED INTO THE COMPONENT
 * ------------------------------------------------------
 * If the National Treasury bulletin is ever parsed — `probe_treasury_debt.py`
 * exists for exactly that, and the bulletin is already a permitted source —
 * this note must disappear on its own. A hard-coded paragraph would keep
 * telling readers a figure is unavailable while it sat on screen above.
 */
import type { ContextIndicator } from '@/types/bond';

/** Label as `worldbank.py` writes it. Matching on label rather than indicator
 *  code because the code does not survive into `context.json`. */
export const DEBT_TO_GDP_LABEL = 'Government debt / GDP';

export interface SovereignGap {
  label: string;
  why: string;
  where: string;
}

const DEBT_TO_GDP_GAP: SovereignGap = {
  label: DEBT_TO_GDP_LABEL,
  why:
    'We ask the World Bank for it and Kenya has no observation in that series — ' +
    'the request succeeds and comes back empty.',
  where:
    'The National Treasury publishes it in its monthly debt bulletin, and the ' +
    'figure quoted in the press comes from there rather than from us.',
};

/**
 * Indicators we request and did not receive.
 *
 * Returns nothing while the context is empty — an unloaded store is not a
 * missing indicator, and claiming otherwise during the first paint would put
 * a gap notice on every cold load.
 */
export function sovereignGaps(context: ContextIndicator[]): SovereignGap[] {
  if (!context.length) return [];
  const present = new Set(context.map((c) => c.label));
  return present.has(DEBT_TO_GDP_LABEL) ? [] : [DEBT_TO_GDP_GAP];
}
