import Link from 'next/link';
import {
  Calculator, Radar, Briefcase, Layers, WifiOff, LockKeyhole, ArrowRight, CalendarCheck,
} from 'lucide-react';
import LiveYieldCard from '@/components/landing/LiveYieldCard';

const features = [
  { Icon: Calculator, title: 'Net Yield Engine', desc: 'Gross and after-tax YTM solved from your actual price — WHT 0/10/15% applied exactly as Kenyan law does.' },
  { Icon: Layers, title: 'Ladder Builder', desc: 'Turn a lump sum into a stream of predictable payouts across staggered maturities — school fees, retirement, income.' },
  { Icon: Radar, title: 'Auction Radar', desc: 'Every CBK offer with countdowns, prospectus links and a step-by-step DhowCSD bidding guide.' },
  { Icon: CalendarCheck, title: 'Payout Calendar', desc: 'Every coupon and redemption on your phone calendar — one tap, with reminders the day before.' },
  { Icon: WifiOff, title: 'Offline-first', desc: 'Installs like an app and works fully offline. Built for real Kenyan networks.' },
  { Icon: LockKeyhole, title: 'Private by design', desc: 'No account. No sign-up. Your portfolio lives on your device and never leaves it.' },
];

const steps = [
  { n: '01', title: 'See what bonds really pay', desc: 'The dashboard ranks live CBK issues by net-of-tax yield — tax-free IFBs against taxable FXDs, at market prices.' },
  { n: '02', title: 'Plan your investment', desc: 'Size a single bond in the calculator or build a full ladder — exact settlement cost, coupons and payout dates before you bid.' },
  { n: '03', title: 'Bid on DhowCSD & track', desc: 'Follow the built-in bidding guide, then import your holdings and watch net income arrive on schedule.' },
];

export default function LandingPage() {
  return (
    <div className="space-y-20 pb-8 pt-6 md:space-y-28 md:pt-14">
      {/* Hero */}
      <section className="grid items-center gap-10 md:grid-cols-[1.2fr,1fr]">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-sand-400 bg-sand-50 px-3 py-1 text-xs font-medium text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-mint-600" />
            Live CBK, NSE &amp; KNBS data · Free
          </p>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-ink md:text-6xl">
            Sovereign yields,
            <br />
            <span className="text-gold-600">crystal clear.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-ink-muted">
            The intelligence layer for Kenya&apos;s bond market. Know exactly what a government
            bond pays <em>after tax</em> — before you bid a single shilling on DhowCSD.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard/"
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 font-display text-sm font-semibold text-sand-50 shadow-card transition hover:bg-ink-soft"
            >
              Open the app <ArrowRight size={16} />
            </Link>
            <Link
              href="/ladder/"
              className="inline-flex items-center gap-2 rounded-xl border border-sand-400 bg-sand-50 px-6 py-3 font-display text-sm font-semibold text-ink transition hover:border-gold-500"
            >
              Build a ladder
            </Link>
          </div>
        </div>
        <div className="relative mx-auto hidden md:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Mwangaza Yield" className="h-72 w-72 rounded-[3rem] shadow-card" />
          <div className="absolute -bottom-8 -left-16">
            <LiveYieldCard />
          </div>
        </div>
      </section>

      {/* Features */}
      <section>
        <h2 className="text-center text-2xl font-bold text-ink md:text-3xl">
          Everything between you and a confident bid
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-ink-muted">
          Institutional-grade fixed-income analytics, sized for a phone and a KES 50,000 minimum.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ Icon, title, desc }) => (
            <div key={title} className="card transition hover:border-gold-500">
              <div className="mb-3 inline-flex rounded-xl bg-ink p-2.5 text-gold-500">
                <Icon size={20} />
              </div>
              <p className="font-display font-semibold text-ink">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-center text-2xl font-bold text-ink md:text-3xl">How it works</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map(({ n, title, desc }) => (
            <div key={n} className="card">
              <p className="num text-sm font-semibold text-gold-600">{n}</p>
              <p className="mt-2 font-display font-semibold text-ink">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="overflow-hidden rounded-3xl bg-treasury-navy px-8 py-12 text-center shadow-card md:py-16">
        <h2 className="font-display text-2xl font-bold text-sand-50 md:text-3xl">
          Your money deserves better than guesswork.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-sand-300/80">
          Free, offline-capable, and private. Add it to your home screen and carry Kenya&apos;s
          bond market in your pocket.
        </p>
        <Link
          href="/dashboard/"
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-gold-500 px-7 py-3 font-display text-sm font-bold text-treasury-dark transition hover:bg-gold-300"
        >
          Get started — it&apos;s free <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
