import type { Metadata } from 'next';
import Link from 'next/link';
import { Calculator, Briefcase, Radar, Globe } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Rates, Curve and Auctions at a Glance — Mwangaza Yield',
  description:
    'Where Kenyan government bond yields sit today, what the curve is doing, the next auction, and the rate cycle behind all of it.',
};
import AuctionBanner from '@/components/dashboard/AuctionBanner';
import TopYields from '@/components/dashboard/TopYields';
import YieldCurveChart from '@/components/dashboard/YieldCurveChart';
import MacroPanel from '@/components/dashboard/MacroPanel';
import SovereignContext from '@/components/dashboard/SovereignContext';
import RateCycle from '@/components/dashboard/RateCycle';
import MarketPulse from '@/components/dashboard/MarketPulse';
import YieldInHistory from '@/components/dashboard/YieldInHistory';
import InflationSplitCard from '@/components/dashboard/InflationSplit';
import EconomicHealthSummary from '@/components/dashboard/EconomicHealthSummary';

const actions = [
  { href: '/calculator/', title: 'Work out your return', desc: 'What a given amount really earns you after tax', Icon: Calculator },
  { href: '/auctions/', title: 'What is on sale now', desc: 'Closing dates, official documents, how to bid', Icon: Radar },
  { href: '/portfolio/', title: 'What you already hold', desc: 'Track your bonds and when they pay — offline', Icon: Briefcase },
  { href: '/macro/', title: 'Economic context', desc: 'Rates, debt, spillovers and policy context in one view', Icon: Globe },
];

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">
          What Kenya is paying <span className="text-gold-700">savers today.</span>
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every current government bond, ranked by what you would actually keep after tax.
        </p>
      </div>

      <TopYields />
      <AuctionBanner />
      <MacroPanel />
      <EconomicHealthSummary />
      <InflationSplitCard />
      <RateCycle />
      <YieldCurveChart />

      {/* Two-up from `lg`. Measured at 1366px, the dashboard ran 3,381px —
          nearly four screens — with every block full width in a single column,
          including two cards that are 432px and 410px tall and side by side
          would cost the height of one.

          These two and not the charts: a yield curve and a rate path need
          their width to stay legible, and buying vertical space by making a
          chart harder to read is not a saving. These are stat-and-prose cards
          that read perfectly well at half width. */}
      <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        <MarketPulse />
        <YieldInHistory />
        <SovereignContext />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {actions.map(({ href, title, desc, Icon }) => (
          <Link key={href} href={href} className="card transition hover:border-gold-500">
            <Icon size={22} className="mb-3 text-gold-600" />
            <p className="font-display font-semibold text-ink">{title}</p>
            <p className="mt-1 text-sm text-ink-muted">{desc}</p>
          </Link>
        ))}
      </div>

      {/* SERVER-RENDERED, AND THE ONLY TEXT ON THIS PAGE THAT IS.
        *
        * Everything above — yields, curve, macro panel, auction banner — is a
        * client island that fetches its own data, so `next build` emits a page
        * whose <main> held 316 characters of text: the heading and one line.
        * That was the whole page to a crawler, a link preview, or a reader
        * whose JavaScript had not arrived.
        *
        * The cards cannot be server-rendered without moving the data fetch,
        * which is a real change to how the app loads and not one worth making
        * for text. What CAN be said on the server is what the figures mean and
        * what they are not — which is the part a reader arriving cold actually
        * needs, and the part no chart conveys. */}
      <div className="mt-10 max-w-[68ch] space-y-4 border-t border-sand-200 pt-6 text-sm leading-relaxed text-ink-soft [&_a]:text-gold-700 [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:font-display [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink [&_strong]:text-ink">
        <h2>What &ldquo;what you keep&rdquo; means here</h2>
        <p>
          Bonds are ranked by yield <strong>after Kenyan withholding tax</strong>, not by coupon.
          Infrastructure bonds pay their coupon whole; other bonds with an original tenor of ten
          years or more are withheld at 10%, and shorter ones at 15%. Ranking on the headline rate
          puts them in a different and misleading order, which is why nothing on this page does.
        </p>

        <h2>Where these figures come from</h2>
        <p>
          Everything here is public: bond and bill terms and auction results from the Central Bank
          of Kenya, fiscal figures from the National Treasury, inflation from KNBS, and the
          sovereign context panel from the World Bank. Each figure carries the date of the document
          it came from, because a rate is only meaningful with its vintage attached.{' '}
          <Link href="/sources/">See the full list</Link>.
        </p>

        <h2>What this page is not</h2>
        <p>
          It is not a market screen. We publish <strong>no secondary-market prices</strong>, so
          nothing here tells you what a bond is worth to sell today — only what it pays if held,
          and what other bidders accepted at auction. Yields shown against bonds you have not
          priced assume par, which is a placeholder rather than a quote; recording what you paid in{' '}
          <Link href="/prices/">your price book</Link> replaces the assumption.
        </p>
        <p>
          Nor is it a forecast, and nor is it advice. What rates have done is a matter of record;
          what they do next is not, and no figure on this page should be read as a view on it.
        </p>
      </div>
    </div>
  );
}
