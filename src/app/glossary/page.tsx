import type { Metadata } from 'next';
import Link from 'next/link';
import Prose from '@/components/shared/Prose';
import GlossaryBrowser from '@/components/glossary/GlossaryBrowser';

export const metadata: Metadata = {
  title: 'Plain English — Mwangaza Yield',
  description:
    'Every term the bond market uses, explained the way you would explain it to a friend. Yield, coupon, the yield curve, withholding tax and the rest.',
};

export default function GlossaryPage() {
  return (
    <Prose
      title="Plain English"
      lead="The bond market has its own vocabulary. None of it is difficult once someone tells you what the words mean — so here they are, in the order you will meet them."
      updated="25 July 2026"
    >
      <p>
        Jargon is not knowledge. It is often the opposite: a way of sounding certain without
        being clear. Everything below is written the way we would explain it across a table,
        with the formal definition underneath where the precision genuinely matters.
      </p>

      <GlossaryBrowser />

      <h2>Still unclear?</h2>
      <p>
        If a term here left you more confused than before, that is our failing rather than
        yours, and we would genuinely like to know — see <Link href="/support/">Support</Link>.
        For the longer walk-through, the <Link href="/learn/">tutorials</Link> take you from
        your first Ksh 50,000 to a full ladder in six short lessons.
      </p>
    </Prose>
  );
}
