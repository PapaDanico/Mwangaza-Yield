import type { Metadata } from 'next';
import Link from 'next/link';
import Prose from '@/components/shared/Prose';
import FeedSnippets from '@/components/feed/FeedSnippets';

/**
 * The feed, made findable.
 *
 * The rates feed has been live for some time: CORS-open, served daily, with a
 * contract document published beside it. And nothing on this website mentioned
 * it. A `grep` for `rates.json` across src/ returned exactly one hit, an
 * internal import — no page, no footer entry, no link. The only people who
 * could have discovered it are the ones who already knew.
 *
 * That is the same defect that put /licensing live with nothing pointing at it,
 * and the same one recorded in RATES-FEED.md, where the contract link pointed
 * into a private repository and every third party the feed exists for got a 404
 * at the moment they were deciding whether to trust it. Publishing something is
 * not the same as shipping it.
 */

export const metadata: Metadata = {
  title: 'Free Kenyan rates feed — Mwangaza Yield',
  description:
    'A free, CORS-open JSON and CSV feed of Kenyan Treasury bill yields, central bank rate, inflation and bond auction benchmarks — computed daily from published CBK and National Treasury releases.',
};

export default function FeedPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Prose
        title="The rates feed"
        lead="Kenyan Treasury bill yields, the central bank rate, inflation and bond auction benchmarks — as JSON or CSV, free, and open to any origin."
      >
        <p>
          Everything this site computes from public Central Bank of Kenya and National Treasury
          releases is published as a feed. It refreshes daily, it needs no key, and it sets{' '}
          <code>Access-Control-Allow-Origin: *</code> so a browser on your own domain can read it
          directly.
        </p>
        <p>
          It exists because the underlying figures are public but awkward: they arrive as PDFs, and
          the number most people want — what a Treasury bill actually pays after withholding tax —
          is not in them. Somebody has to do that arithmetic. It may as well be done once,
          in the open, where the working can be checked.
        </p>
      </Prose>

      <div className="mt-6">
        <FeedSnippets />
      </div>

      <div className="mt-8">
        <Prose title="What is in it">
          <ul>
            <li>
              <strong>tbills</strong> — the 91, 182 and 364-day papers: CBK&apos;s quoted rate, the
              gross effective annual yield, and the net yield after withholding tax, with the price
              per 100 and the next auction date.
            </li>
            <li>
              <strong>macro</strong> — central bank rate, headline inflation with its core and
              non-core split, and the shilling against the dollar.
            </li>
            <li>
              <strong>bondAuctionBenchmarks</strong> — the comparable window, minimum sample and
              rate bands behind our bond guidance.
            </li>
            <li>
              <strong>notes</strong> — sourcing, conventions, warranty and attribution, carried
              inside the payload so they travel with the data rather than living only on this page.
            </li>
          </ul>
          <h2>The one thing to read before you use it</h2>
          <p>
            <code>quotedDiscountRate</code> is CBK&apos;s published quote and is{' '}
            <strong>not a return</strong>. Projecting income from it overstates what a saver
            receives. Use <code>netEAY</code>, and compare it only against other net-of-tax yields.
            That distinction is the single most common error in Kenyan rate reporting and it is why
            the field names are deliberately unambiguous.
          </p>
          <h2>What it does not contain</h2>
          <p>
            No exchange-sourced or secondary-market prices, published or implied. Every figure is a
            dated snapshot derived from a published release — nothing streams, and there is no
            market feed here to stream from. If you need traded prices, this is not that.
          </p>
          <h2>Terms</h2>
          <p>
            Free to use, including commercially. Attribute it to Mwangaza Yield with a link, keep
            the notes with the data if you redistribute it, and do not present it as something it is
            not — these are dated snapshots of published releases, not traded prices. It is
            provided without warranty — check anything you are going to act on against
            the CBK release it came from.
          </p>
          <p>
            If you are building something on it and want a heads-up before the schema changes, or
            need a shape we do not publish,{' '}
            <Link href="/licensing/">get in touch</Link>. The full contract is served beside the
            feed itself at{' '}
            <a href="/data/RATES-FEED.md">/data/RATES-FEED.md</a> — deliberately, so it is
            reachable by anyone who can reach the feed.
          </p>
        </Prose>
      </div>
    </main>
  );
}
