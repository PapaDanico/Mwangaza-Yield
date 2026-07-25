/**
 * A years figure as a range, written low to high, which is how a reader expects
 * a range to run. The disclosure says in words which end to plan on, rather than
 * leaving it to be inferred from the order.
 *
 * Three things this has to avoid, all of them reachable:
 *  - Mixed units. Formatting each end independently produced "11m-1.2" under a
 *    heading that says years, so the unit is chosen once from the larger value
 *    and applied to both.
 *  - "Funded-1.8". Being funded only if rates hold is not being funded, so when
 *    just the optimistic end is already there the cautious figure stands alone.
 *  - False precision. Ends that round the same collapse to one number.
 */
export function yearsLabel(cautious: number | null, ifRatesHold: number | null): string {
  const known = [cautious, ifRatesHold].filter((v): v is number => v !== null);
  if (!known.length) return '—';

  const useMonths = Math.max(...known) < 1;
  const one = (y: number) =>
    y === 0 ? 'Funded'
      : useMonths ? `${Math.max(1, Math.round(y * 12))}m`
      : y.toFixed(1);

  // Unreachable even at today's rates is a different statement from a range.
  if (cautious === null) return ifRatesHold === null ? '—' : `${one(ifRatesHold)}+`;
  if (ifRatesHold === null) return one(cautious);
  if (cautious === 0) return 'Funded';
  if (ifRatesHold === 0 || one(ifRatesHold) === one(cautious)) return one(cautious);
  return `${one(ifRatesHold)}–${one(cautious)}`;
}
