import type { Metadata } from 'next';
import Link from 'next/link';
import AuctionReview from '@/components/report/AuctionReview';

export const metadata: Metadata = {
  title: 'Monthly auction review — Mwangaza Yield',
  description:
    'What the Treasury asked for, what the market bid, and what was accepted at each Kenyan government bond auction — computed from CBK’s published results.',
};

/**
 * A page that is also a document. It prints to a single readable sheet, which
 * is the form this is actually useful in: a SACCO treasurer, a broker's retail
 * desk or a journalist wants something they can forward, not a dashboard they
 * have to log into.
 *
 * Free to read, deliberately. The archive behind it took the work; the note is
 * how anyone finds out the archive exists.
 */
export default function ReviewPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24">
      <p className="no-print text-xs font-semibold uppercase tracking-wide text-gold-700">
        Monthly review
      </p>
      <AuctionReview />

      <div className="no-print mt-8 rounded-2xl border border-sand-300 bg-sand-50 p-5 text-sm text-ink-soft">
        <p className="font-semibold text-ink">Where these numbers come from</p>
        <p className="mt-1">
          Every figure is parsed from the auction result PDFs the Central Bank of Kenya publishes.
          Those documents are public; this is the only machine-readable form of them we know of. The{' '}
          <Link href="/sources/" className="text-gold-700 underline">
            sources page
          </Link>{' '}
          shows exactly how complete that archive is, field by field — including what is still
          missing from it.
        </p>
        <p className="mt-2">
          Use these figures, quote them, build on them. If you want the underlying series, longer
          history, or this note on a schedule, <Link href="/support/" className="text-gold-700 underline">get in touch</Link>.
        </p>
      </div>
    </div>
  );
}
