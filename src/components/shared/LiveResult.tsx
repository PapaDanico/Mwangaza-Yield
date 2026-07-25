/**
 * Announces a recalculated result to a screen reader.
 *
 * The sliders and amount boxes rewrite a dozen figures on every keystroke, and
 * none of it reaches someone who cannot see the panel — they move the price
 * slider and hear nothing at all, which is the whole product going silent.
 *
 * It is deliberately ONE short sentence, not the results table. A polite live
 * region re-reads its entire contents on every change, so marking the table
 * live would replay twelve rows per slider tick — noisier than silence and
 * quicker to be switched off. This carries the headline the page exists to
 * deliver; the detail stays reachable by arrowing through the rows.
 */
export default function LiveResult({ children }: { children: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {children}
    </p>
  );
}
