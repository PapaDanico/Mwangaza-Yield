import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Tutorials — Mwangaza Yield',
  description: 'Learn how Kenyan government securities work, from your first KES 50,000 to a full ladder.',
};

const LESSONS = [
  {
    n: '01',
    title: 'What you are actually buying',
    minutes: 3,
    body: (
      <>
        <p>
          When you buy a Treasury bond you are lending money to the Government of Kenya. In return
          it pays you a fixed <strong>coupon</strong> twice a year and returns your{' '}
          <strong>face value</strong> on the maturity date. A Treasury bill works differently:
          there is no coupon at all. You buy it below face value and receive the full face value at
          maturity — the gap is your interest.
        </p>
        <p>
          Three families matter in Kenya. <strong>FXD</strong> — fixed coupon bonds, 2 to 30 years.{' '}
          <strong>IFB</strong> — infrastructure bonds, which are exempt from withholding tax and
          therefore usually the highest net yield on the board. <strong>T-bills</strong> — 91, 182
          and 364 days, auctioned weekly.
        </p>
      </>
    ),
    cta: { href: '/dashboard/', label: 'See live issues' },
  },
  {
    n: '02',
    title: 'Why the advertised rate is never what you get',
    minutes: 4,
    body: (
      <>
        <p>Three things sit between the headline number and your bank account.</p>
        <p>
          <strong>Withholding tax.</strong> 15% on bonds shorter than ten years, 10% on ten years
          and longer, 0% on infrastructure bonds. Tax applies to coupon income only, never to the
          principal returned at maturity.
        </p>
        <p>
          <strong>The price you pay.</strong> A coupon is a percentage of face value, not of what
          you paid. Buy a 16% bond at 108 and you are earning 16 shillings on 108 spent, not on 100.
          Yield to maturity accounts for this; the coupon alone does not.
        </p>
        <p>
          <strong>Accrued interest.</strong> Buying between coupon dates means paying the seller for
          interest already earned. The quoted &ldquo;clean&rdquo; price excludes it; the
          &ldquo;dirty&rdquo; price you actually settle includes it.
        </p>
      </>
    ),
    cta: { href: '/calculator/', label: 'Run the numbers' },
  },
  {
    n: '03',
    title: 'Reading a T-bill quote correctly',
    minutes: 3,
    body: (
      <>
        <p>
          T-bill rates are quoted as a <strong>discount rate</strong>, and it misleads in both
          directions at once. A 91-day bill quoted at 8.80% prices at about 97.81 per 100. You earn
          2.19 on 97.81 spent over 91 days, which annualises to roughly <strong>9.30%</strong> —
          higher than the quote. Then 15% withholding tax takes it down to about{' '}
          <strong>7.87%</strong> — lower than the quote.
        </p>
        <p>
          The gap widens with tenor, because a 364-day bill prices near 91 rather than 98, so the
          same discount is earned on a much smaller outlay. Only the net figure is comparable to a
          bond&apos;s net yield.
        </p>
      </>
    ),
    cta: { href: '/tbills/', label: 'Compare all tenors' },
  },
  {
    n: '04',
    title: 'Bidding on DhowCSD',
    minutes: 5,
    body: (
      <>
        <p>
          Register at dhowcsd.centralbank.go.ke with your National ID, KRA PIN and bank details.
          Approval usually takes one to three business days. There is no broker and no commission —
          you deal with the Central Bank directly.
        </p>
        <p>
          At the auction you choose <strong>non-competitive</strong> or{' '}
          <strong>competitive</strong> bidding. Non-competitive means you accept the weighted
          average rate the market clears at, and is available up to KES 50 million — this is what
          almost every retail investor should use. Competitive bidding means naming your own rate,
          and if you bid too aggressively you simply get nothing.
        </p>
        <p>
          Bids close before the auction date — Thursday 2:00pm for bills. Once allotted, you must
          fund the settlement by the value date or forfeit.
        </p>
      </>
    ),
    cta: { href: '/auctions/', label: 'See the calendar' },
  },
  {
    n: '05',
    title: 'Laddering, and matching money to life',
    minutes: 4,
    body: (
      <>
        <p>
          Putting everything into one bond creates two problems: your entire holding is exposed to
          one day&apos;s rate, and the money is locked until one date that may not be when you need
          it. A <strong>ladder</strong> solves both by holding several bonds maturing in different
          years.
        </p>
        <p>
          The real power is maturity matching. If school fees fall due in 2033, holding a bond that
          matures in 2033 means the principal arrives when the invoice does — no selling into a bad
          market, no guessing. The same logic builds a retirement income or an emergency reserve.
        </p>
      </>
    ),
    cta: { href: '/goals/', label: 'Plan by objective' },
  },
  {
    n: '06',
    title: 'The risks nobody advertises',
    minutes: 3,
    body: (
      <>
        <p>
          Government bonds carry minimal credit risk in shillings, but they are not risk-free.{' '}
          <strong>Rates rise, prices fall</strong> — sell early after a rate rise and you lose
          money. <strong>Inflation erodes fixed coupons</strong>: 12% net against 6.4% inflation is
          about 5.6% in real terms. <strong>Liquidity is thin</strong> for many issues, so selling
          quickly may mean selling cheaply.
        </p>
        <p>
          The practical defence is simple: buy what you can hold to maturity, and match maturities
          to when you actually need the money.
        </p>
      </>
    ),
    cta: { href: '/disclaimer/', label: 'Full risk disclaimer' },
  },
];

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">Tutorials</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">
          From your first KES 50,000 to a full ladder
        </h1>
        <p className="mt-2 text-lg text-ink-muted">
          Six short lessons on how Kenyan government securities really work — written for people
          investing their own money, not for exam candidates.
        </p>
      </div>

      <div className="space-y-4">
        {LESSONS.map((l) => (
          <article key={l.n} className="card">
            <div className="flex items-baseline gap-3">
              <span className="num text-sm font-bold text-gold-700">{l.n}</span>
              <h2 className="font-display text-lg font-bold text-ink">{l.title}</h2>
              <span className="ml-auto shrink-0 text-xs text-ink-faint">{l.minutes} min</span>
            </div>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">{l.body}</div>
            <Link
              href={l.cta.href}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold-700 underline-offset-2 hover:underline"
            >
              {l.cta.label} <ArrowRight size={14} />
            </Link>
          </article>
        ))}
      </div>

      <div className="rounded-3xl bg-treasury-navy px-6 py-10 text-center">
        <h2 className="font-display text-xl font-bold text-sand-50">Ready to put it to work?</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-sand-300/70">
          Start from what the money is for — fees, income, independence — and let the app shape the
          bonds around it.
        </p>
        <Link
          href="/goals/"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gold-500 px-6 py-3 font-display text-sm font-bold text-treasury-dark transition hover:bg-gold-300"
        >
          Plan by objective <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
