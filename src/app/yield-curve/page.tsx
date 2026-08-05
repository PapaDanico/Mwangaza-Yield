import type { Metadata } from 'next';
import Link from 'next/link';
import Prose from '@/components/shared/Prose';
import CurveHistory from '@/components/curve/CurveHistory';

export const metadata: Metadata = {
  title: 'Kenya’s yield curve, year by year — Mwangaza Yield',
  description:
    'The Kenyan government bond yield curve rebuilt from CBK auction results, one curve per year, with the underlying figures as a free CSV download.',
};

export default function YieldCurvePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Prose
        title="Kenya’s yield curve, year by year"
        lead="What the government has had to pay to borrow, from two years out to twenty — rebuilt from the Central Bank’s own auction results."
      >
        <p>
          A yield curve shows what it costs the government to borrow for two years against twenty.
          Its shape is the clearest single picture of what the market thinks money is worth — and
          in Kenya it has moved a long way in a short time.
        </p>
        <p>
          Each year&apos;s curve here uses only auctions held in that year, so you are comparing
          points that are contemporaries of one another rather than a ten-year yield from 2024
          against a two-year from 2026.
        </p>
      </Prose>

      <div className="card mx-auto mt-6 max-w-2xl">
        <CurveHistory />
      </div>

      <div className="mt-8">
        <Prose title="How to read it">
          <p>
            A curve that rises from left to right is the ordinary shape: lending for longer is
            riskier, so it pays more. When the short end climbs above the long end, the market is
            saying it wants paying more to lend for two years than for twenty — which is what
            happened here through 2023 and 2024.
          </p>
          <h2>What this is not</h2>
          <p>
            These are auction clearing rates, not live market prices. We publish no secondary
            market prices, so this cannot tell you what a bond is worth to sell today — only what
            the government paid to issue at that tenor, in that year.
          </p>
          <p>
            Nor is any of it a forecast. What the curve did is a matter of record; what it does
            next is not.
          </p>
          <p>
            Every figure comes from CBK auction result documents, which are public.{' '}
            <Link href="/sources/">See all our data sources</Link>, or take the numbers from the
            CSV above and check us.
          </p>
        </Prose>
      </div>
    </main>
  );
}
