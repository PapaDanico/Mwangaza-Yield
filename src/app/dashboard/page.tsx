import Link from 'next/link';
import { Calculator, Briefcase, Radar } from 'lucide-react';
import AuctionBanner from '@/components/dashboard/AuctionBanner';
import TopYields from '@/components/dashboard/TopYields';
import YieldCurveChart from '@/components/dashboard/YieldCurveChart';
import MacroPanel from '@/components/dashboard/MacroPanel';
import SovereignContext from '@/components/dashboard/SovereignContext';
import RateCycle from '@/components/dashboard/RateCycle';

const actions = [
  { href: '/calculator/', title: 'Work out your return', desc: 'What a given amount really earns you after tax', Icon: Calculator },
  { href: '/auctions/', title: 'What is on sale now', desc: 'Closing dates, official documents, how to bid', Icon: Radar },
  { href: '/portfolio/', title: 'What you already hold', desc: 'Track your bonds and when they pay — offline', Icon: Briefcase },
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
      <RateCycle />
      <YieldCurveChart />
      <SovereignContext />

      <div className="grid gap-3 md:grid-cols-3">
        {actions.map(({ href, title, desc, Icon }) => (
          <Link key={href} href={href} className="card transition hover:border-gold-500">
            <Icon size={22} className="mb-3 text-gold-600" />
            <p className="font-display font-semibold text-ink">{title}</p>
            <p className="mt-1 text-sm text-ink-muted">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
