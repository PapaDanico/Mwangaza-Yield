/**
 * The headline verdict on the macro page, and its supporting tags.
 *
 * WHY THIS LIVES IN lib/ RATHER THAN IN THE PAGE
 *
 * It was in the page, where nothing could test it, and it shipped a defect
 * that survived a repair pass aimed at exactly that defect. Two figures it
 * reads — debt/GDP and the EM spread — became null when the unverifiable
 * indicators behind them were removed, and each `else` branch fell through to
 * a green tag. The page asserted "Debt within threshold" and "Contained spread
 * vs. EM" about numbers nobody has.
 *
 * The tags were the visible half. `conditions` counts green tags, so each
 * absent figure also pushed the verdict toward "Broadly supportive for bond
 * investors" — a recommendation about where to put money, built partly from
 * data that is not there.
 *
 * A missing figure now contributes nothing in either direction. It is neither
 * a pass nor a fail, and the tests beside this file exist so the `else` cannot
 * quietly reacquire a default.
 */
export function macroRegime(cbr: number, cpi: number, debtToGDP: number | null, kenyaSpread: number | null, sentiment: string): {
  label: string;
  description: string;
  tags: { text: string; color: string }[];
} {
  const realRate = cbr - cpi;
  const tags: { text: string; color: string }[] = [];

  if (sentiment === 'dovish') tags.push({ text: 'Easing cycle', color: 'bg-mint-500/15 text-mint-700' });
  else if (sentiment === 'hawkish') tags.push({ text: 'Tightening cycle', color: 'bg-red-500/15 text-red-700' });
  else tags.push({ text: 'Policy on hold', color: 'bg-sand-200 text-ink-soft' });

  if (realRate > 1) tags.push({ text: 'Positive real rates', color: 'bg-mint-500/15 text-mint-700' });
  else if (realRate < 0) tags.push({ text: 'Negative real rates', color: 'bg-red-500/15 text-red-700' });

  // A figure we do not have is not a passing grade.
  //
  // Both of these read null today — the unverifiable debt and EM-spread
  // indicators were removed because none could be checked against the source
  // they were attributed to — and each `else` fell through to a mint tag. So
  // the page asserted "Debt within threshold" and "Contained spread vs. EM"
  // about numbers nobody has.
  //
  // The tags were the visible half. `conditions` below counts mint tags, so
  // each absent figure also pushed the headline verdict toward "Broadly
  // supportive for bond investors" — built, in part, from data that is not
  // there. Absence now contributes nothing in either direction, which is the
  // rule EconomicHealthSummary and computeKenyaSpread already follow.
  if (debtToGDP !== null) {
    if (debtToGDP > 70) tags.push({ text: 'Elevated debt burden', color: 'bg-red-500/15 text-red-700' });
    else if (debtToGDP > 55) tags.push({ text: 'Moderate debt pressure', color: 'bg-gold-500/15 text-gold-700' });
    else tags.push({ text: 'Debt within threshold', color: 'bg-mint-500/15 text-mint-700' });
  }

  if (kenyaSpread !== null) {
    if (kenyaSpread > 4) tags.push({ text: 'Wide spread vs. EM peers', color: 'bg-gold-500/15 text-gold-700' });
    else tags.push({ text: 'Contained spread vs. EM', color: 'bg-mint-500/15 text-mint-700' });
  }

  const conditions = tags.filter((t) => t.color.includes('mint')).length;
  const risks = tags.filter((t) => t.color.includes('red')).length;

  let label: string;
  let description: string;
  if (conditions > risks + 1) {
    label = 'Broadly supportive for bond investors';
    description = 'Policy rates are positive in real terms and yields compensate for duration and sovereign risk. Conditions favour holding.';
  } else if (risks > conditions) {
    label = 'Elevated risk environment';
    description = 'Debt dynamics or policy signals introduce headwinds. Scrutinise duration and credit risk before extending.';
  } else {
    label = 'Mixed signals — selectivity rewarded';
    description = 'Some conditions support bonds while others introduce risk. Pricing discipline and security selection matter more than direction bets.';
  }
  return { label, description, tags };
}
