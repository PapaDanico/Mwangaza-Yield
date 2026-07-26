import type { Metadata } from 'next';
import Link from 'next/link';
import Prose from '@/components/shared/Prose';
import { GLOSSARY } from '@/lib/glossary';

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

      <nav aria-label="Jump to a term" className="not-prose my-6 flex flex-wrap gap-1.5">
        {GLOSSARY.map((t) => (
          <a
            key={t.slug}
            href={`#${t.slug}`}
            className="rounded-lg border border-sand-300 bg-sand-100 px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-gold-500 hover:text-ink"
          >
            {t.term}
          </a>
        ))}
      </nav>

      <div className="not-prose space-y-3">
        {GLOSSARY.map((t) => (
          <section
            key={t.slug}
            id={t.slug}
            className="scroll-mt-24 rounded-xl border border-sand-300 bg-sand-50 p-4"
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="font-display text-base font-bold text-ink">{t.term}</h2>
              {t.also && <span className="text-xs text-ink-faint">also: {t.also}</span>}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t.plain}</p>
            {t.why && (
              <p className="mt-2 border-l-2 border-gold-500 pl-3 text-sm leading-relaxed text-ink-muted">
                {t.why}
              </p>
            )}
            {t.precise && (
              <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                <span className="font-semibold uppercase tracking-wider">Precisely: </span>
                {t.precise}
              </p>
            )}
          </section>
        ))}
      </div>

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
