import Link from 'next/link';
import {
  Calculator, Radar, Briefcase, Layers, WifiOff, LockKeyhole, ArrowRight, CalendarCheck, Receipt,
  RefreshCw, Landmark, Users, BarChart3, Target, GraduationCap, Flame, CalendarHeart, BookOpen,
} from 'lucide-react';
import LiveYieldCard from '@/components/landing/LiveYieldCard';
import EvidenceStrip from '@/components/landing/EvidenceStrip';

const features = [
  { Icon: Calculator, title: 'What you actually earn', desc: 'Enter what you would pay and see the return after tax — the figure that reaches your bank account, not the one on the poster.' },
  { Icon: Receipt, title: 'Treasury bills, translated', desc: 'A “9% discount rate” is not a 9% return. We do the conversion for 91, 182 and 364-day bills, and show what rolling them over would earn.' },
  { Icon: Layers, title: 'Money that arrives on time', desc: 'Spread a lump sum so something matures each year — when school fees fall due, when you retire, when you need it.' },
  { Icon: Radar, title: 'Never miss an offer', desc: 'Every Central Bank sale with the closing date, the official prospectus, and a walk-through of placing your bid on DhowCSD.' },
  { Icon: CalendarCheck, title: 'Payments in your calendar', desc: 'Every interest payment and repayment date on your phone, with a reminder the day before. One tap.' },
  { Icon: WifiOff, title: 'Works without a network', desc: 'Add it to your home screen and it keeps working on the matatu, in the shamba, wherever the signal goes.' },
  { Icon: LockKeyhole, title: 'Yours alone', desc: 'No account, no sign-up, no e-mail. What you hold stays on your phone and is never sent to us.' },
  { Icon: BookOpen, title: 'Learn as you go', desc: 'Six short lessons from your first KES 50,000 to a full ladder — plus every term explained in plain English.' },
];

const steps = [
  { n: '01', title: 'See what is really on offer', desc: 'We rank every current government bond by what it pays you after tax — so the tax-free ones and the taxable ones can finally be compared honestly.' },
  { n: '02', title: 'Shape it around your life', desc: 'Say what the money is for and how much you have. We work out the cost, the payment dates and what lands in your hand.' },
  { n: '03', title: 'Place your bid, then relax', desc: 'Follow the step-by-step guide on DhowCSD, record what you bought, and let the app tell you when each payment is coming.' },
];

export default function LandingPage() {
  return (
    <div className="space-y-20 pb-8 pt-6 md:space-y-28 md:pt-14">
      {/* Hero */}
      <section className="grid items-center gap-10 md:grid-cols-[1.2fr,1fr]">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-sand-400 bg-sand-50 px-3 py-1 text-xs font-medium text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-mint-600" />
            Built on public CBK, NSE &amp; KNBS data · Always free
          </p>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-ink md:text-6xl">
            When you lend to Kenya,
            <br />
            <span className="text-gold-700">know what you earn.</span>
          </h1>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-ink-faint">
            Government bonds, made plain
          </p>
          <p className="mt-5 max-w-lg text-lg text-ink-muted">
            Buying a government bond means lending your money to your own country, and being
            paid for it. We show you exactly what one pays <em>after tax</em> — in plain
            language, before you commit a single shilling.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/dashboard/"
              className="inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 font-display text-sm font-semibold text-sand-50 shadow-card transition hover:bg-ink-soft"
            >
              See today&apos;s rates <ArrowRight size={16} />
            </Link>
            <Link
              href="/goals/"
              className="inline-flex items-center gap-2 rounded-xl border border-sand-400 bg-sand-50 px-6 py-3 font-display text-sm font-semibold text-ink transition hover:border-gold-500"
            >
              Start with a goal
            </Link>
          </div>

          {/* Trust markers, per the brand board's poster footer */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-sand-300 pt-5">
            {[
              { Icon: RefreshCw, label: 'Refreshed every weekday' },
              { Icon: Landmark, label: 'Official CBK figures' },
              { Icon: Users, label: 'For ordinary savers' },
              { Icon: BarChart3, label: 'Every source named' },
            ].map(({ Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <Icon size={13} className="text-gold-600" /> {label}
              </span>
            ))}
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

      {/* Evidence, before features: a first-time visitor has no reason to
          believe the yield figures yet, so show the record underneath them. */}
      <EvidenceStrip />

      {/* Features */}
      <section>
        <h2 className="text-center text-2xl font-bold text-ink md:text-3xl">
          Everything you need. No finance degree required.
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-ink-muted">
          The same analysis banks run on their trading desks, rebuilt for a phone, a KES 50,000
          starting balance, and someone who has never bought a bond before.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Objectives — dark navy band, per the brand boards */}
      <section className="-mx-4 bg-treasury-navy px-4 py-14 md:mx-0 md:rounded-3xl md:px-10 md:py-16">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">
          Start with the why
        </p>
        <h2 className="mt-3 text-center font-display text-2xl font-bold text-sand-50 md:text-3xl">
          Nobody wants a bond. They want the thing it pays for.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-sm text-sand-300/70">
          A school term. A quiet retirement. Rent covered without working for it. Tell us what
          you are saving towards, and we will shape the dates, the taxes and the payments
          around your life instead of the other way round.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { Icon: Flame, title: 'Freedom from a payslip', desc: 'How much you would need invested to live on the interest alone — and how close today’s savings already are.' },
            { Icon: GraduationCap, title: 'School fees', desc: 'Bonds chosen to repay in the years the fees fall due, so the money arrives with the invoice.' },
            { Icon: CalendarHeart, title: 'Income you don’t work for', desc: 'Bonds that pay in different months, combined so something arrives most months of the year.' },
            { Icon: LockKeyhole, title: 'Keeping it safe', desc: 'Short Treasury bills for money you may need soon, that still earn while it waits.' },
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-sand-300/15 bg-sand-50/[0.03] p-5">
              <Icon size={20} className="text-gold-500" />
              <p className="mt-3 font-display font-semibold text-sand-50">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-sand-300/60">{desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/goals/"
            className="inline-flex items-center gap-2 rounded-xl bg-gold-500 px-6 py-3 font-display text-sm font-bold text-treasury-dark transition hover:bg-gold-300"
          >
            <Target size={16} /> Start with a goal
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="text-center text-2xl font-bold text-ink md:text-3xl">How it works</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map(({ n, title, desc }) => (
            <div key={n} className="card">
              <p className="num text-sm font-semibold text-gold-700">{n}</p>
              <p className="mt-2 font-display font-semibold text-ink">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="overflow-hidden rounded-3xl bg-treasury-navy px-8 py-12 text-center shadow-card md:py-16">
        <h2 className="font-display text-2xl font-bold text-sand-50 md:text-3xl">
          Mwangaza means light. That is the whole idea.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-sand-300/80">
          Kenya&apos;s bond market has been open to ordinary savers for years — most people were
          simply never shown the door. It is free, it works offline, and it asks nothing of you.
          Add it to your home screen and have a look around.
        </p>
        <Link
          href="/dashboard/"
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-gold-500 px-7 py-3 font-display text-sm font-bold text-treasury-dark transition hover:bg-gold-300"
        >
          Have a look — it&apos;s free <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}
