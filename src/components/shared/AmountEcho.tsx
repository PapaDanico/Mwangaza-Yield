import { formatKES } from '@/lib/financial-engine';

/**
 * The amount, read back with separators.
 *
 * A number field shows 1000000 and nothing else, which is easy to misread by a
 * zero in a money app. This echoes the same value as Ksh 1,000,000 beneath the
 * field. Decorative (aria-hidden): the field itself is what assistive tech
 * reads, and the value is unchanged.
 */
export default function AmountEcho({ amount }: { amount: number }) {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return (
    <p aria-hidden="true" className="num mt-1.5 text-xs text-ink-muted">
      {formatKES(amount)}
    </p>
  );
}
