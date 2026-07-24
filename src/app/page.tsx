import Link from 'next/link';
import { Calculator, Briefcase, Radar } from 'lucide-react';
import AuctionBanner from '@/components/dashboard/AuctionBanner';
import TopYields from '@/components/dashboard/TopYields';
import YieldCurveChart from '@/components/dashboard/YieldCurveChart';
import MacroPanel from '@/components/dashboard/MacroPanel';

const actions = [
  { href: '/calculator/', title: 'Net Yield Calculator', desc: 'After-tax returns per Kenyan WHT law', Icon: Calculator },
  { href: '/auctions/', title: 'Auction Radar', desc: 'Countdowns, prospectuses, bid guidance', Icon: Radar },
  { href: '/portfolio/', title: 'My Portfolio', desc: 'Import holdings, track coupons offline', Icon: Briefcase },
];

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Karibu <span className="text-gold-500">👋</span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          What your money can earn in Kenyan government bonds — after tax, today.
        </p>
      </div>

      <TopYields />
      <AuctionBanner />
      <MacroPanel />
      <YieldCurveChart />

      <div className="grid gap-3 md:grid-cols-3">
        {actions.map(({ href, title, desc, Icon }) => (
          <Link key={href} href={href} className="card transition hover:border-gold-500/50">
            <Icon size={22} className="mb-3 text-gold-400" />
            <p className="font-semibold text-white">{title}</p>
            <p className="mt-1 text-sm text-slate-400">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
