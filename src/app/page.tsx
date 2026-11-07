import Link from 'next/link';
import {
  Calculator, Radar, Briefcase, Layers, WifiOff, LockKeyhole, ArrowRight, CalendarCheck, Receipt,
  RefreshCw, Landmark, Users, BarChart3, Target, BookOpen,
  ArrowRightLeft,
} from 'lucide-react';
import LiveYieldCard from '@/components/landing/LiveYieldCard';
import EvidenceStrip from '@/components/landing/EvidenceStrip';
import { updateCadence } from '@/lib/data-freshness';

const features = [
  { Icon: Calculator, title: 'What you actually earn', desc: 'Enter what you would pay and see the return after tax — the figure that reaches your bank account, not the one on the poster.' },
  { Icon: Receipt, title: 'Treasury bills, translated', desc: 'A “9% discount rate” is not a 9% return. We do the conversion for 91, 182 and 364-day bills, and show what rolling them over would earn.' },
  { Icon: Layers, title: 'Money that arrives on time', desc: 'Spread a lump sum so something matures each year — when school fees fall due, when you retire, when you need it.' },
  { Icon: Radar, title: 'Never miss an offer', desc: 'Every Central Bank sale with the closing date, the official prospectus, and a walk-through of placing your bid on DhowCSD.' },
  { Icon: CalendarCheck, title: 'Payments in your calendar', desc: 'Every interest payment and repayment date on your phone, with a reminder the day before. One tap.' },
  { Icon: WifiOff, title: 'Works without a network', desc: 'Add it to your home screen and it keeps working on the matatu, in the shamba, wherever the signal goes.' },
  { Icon: LockKeyhole, title: 'Yours alone', desc: 'No account, no sign-up, no e-mail. What you hold stays on your phone and is never sent to us.' },
  { Icon: BookOpen, title: 'Learn as you go', desc: 'Six short lessons from your first Ksh 50,000 to a full ladder — plus every term explained in plain English.' },
];

const steps = [
  { n: '01', title: 'See what is really on offer', desc: 'We rank every current government bond by what it pays you after tax — so the tax-free ones and the taxable ones can finally be compared honestly.' },
  { n: '02', title: 'Shape it around your life', desc: 'Say what the money is for and how much you have. We work out the cost, the payment dates and what lands in your hand.' },
  { n: '03', title: 'Place your bid, then relax', desc: 'Follow the step-by-step guide on DhowCSD, record what you bought, and let the app tell you when each payment is coming — and what it is worth if you ever decide to sell.' },
];

export default function LandingPage() {
  return (
    <div className="space-y-20 pb-8 pt-6 md:space-y-28 md:pt-14">
      {/* Hero */}
      <section className="grid items-center gap-10 md:grid-cols-[1.2fr,1fr]">
        <div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-sand-400 bg-sand-50 px-3 py-1 text-xs font-medium text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-mint-600" />
            Built on public CBK, Treasury &amp; KNBS data · Always free
          </p>
          {/* Sized so "When you lend to Kenya," holds one line in the hero's
              column from lg up. At md:text-6xl it did not, and "Kenya," was left
              alone on its own line above the tagline. */}
          <h1 className="text-4xl font-bold leading-[1.08] text-ink md:text-[2.75rem] lg:text-[3.35rem]">
            When you lend to Kenya,
            <br />
            <span className="text-gold-700">know what you earn.</span>
          </h1>
          <p className="mt-3 text-sm font-semibold tracking-[0.22em] text-ink-faint">
            Government bonds, made plain
          </p>
          <p className="mt-5 max-w-lg text-lg text-ink-muted">
            Buying a government bond means lending your money to your own country, and being paid
            for it. The arithmetic behind it is not difficult — it has just rarely been shown to
            the people whose money it is. So we show it: what a bond pays <em>after tax</em>, in
            plain language, before you commit a single shilling.
          </p>
          {/* Stacked buttons match each other's width; side-by-side ones do not.
              Measured at 390px, these wrapped to their own content widths — 189px
              above 158px — leaving a ragged right edge and a 31px step between two
              choices that carry equal weight. A phone has one column, so a button
              that stops short of it reads as unfinished rather than as emphasis.
              Full width below sm:, intrinsic width once they sit in a row. */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/dashboard/"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 font-display text-sm font-semibold text-sand-50 shadow-card transition hover:bg-ink-soft sm:w-auto"
            >
              See today&apos;s rates <ArrowRight size={16} />
            </Link>
            <Link
              href="/goals/"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sand-400 bg-sand-50 px-6 py-3 font-display text-sm font-semibold text-ink transition hover:border-gold-500 sm:w-auto"
            >
              Start with a goal
            </Link>
          </div>

          {/* Trust markers, per the brand board's poster footer */}
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-sand-300 pt-5">
            {[
              { Icon: RefreshCw, label: `Updated ${updateCadence()}` },
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
        {/* The slot is reserved at the card's tallest (the par disclosure
            showing) because the card fills in from IndexedDB after hydration.
            Without it the hero's right column changed height when the figure
            arrived. Phones skip it: the figure sits one tap away on the
            dashboard, and above the fold the headline and buttons matter more. */}
        <div className="hidden min-h-[22rem] items-center justify-center md:flex">
          <LiveYieldCard />
        </div>
      </section>

      {/* Evidence, before features: a first-time visitor has no reason to
          believe the yield figures yet, so show the record underneath them. */}
      <EvidenceStrip />

      {/* Features */}
      <section>
        <h2 className="text-center text-2xl font-bold text-ink md:text-3xl">
          The whole picture, in your own hands.
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-ink-muted">
          The same analysis a trading desk runs, rebuilt for a phone, a Ksh 50,000 starting
          balance, and an evening at the kitchen table. Nothing here assumes you have done this
          before — and nothing here talks down to you if you have.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ Icon, title, desc }) => (
            <div key={title} className="card">
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
        <p className="text-center text-sm font-semibold tracking-[0.2em] text-gold-500">
          Start with the why
        </p>
        <h2 className="mt-3 text-center font-display text-2xl font-bold text-sand-50 md:text-3xl">
          Nobody wants a bond. They want the thing it pays for.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-sm text-sand-300/70">
          A school term. A quiet retirement. Rent covered without working for it. Tell us what
          you are saving towards, and we shape the dates, the taxes and the payments around
          your life: school fees, income you do not work for, freedom from a payslip, or money
          kept safe and still earning.
        </p>
        <div className="mt-7 text-center">
          <Link
            href="/goals/"
            className="inline-flex items-center gap-2 rounded-xl bg-gold-500 px-6 py-3 font-display text-sm font-bold text-treasury-dark transition hover:bg-gold-300"
          >
            <Target size={16} /> Start with a goal
          </Link>
        </div>
      </section>

      {/* The sell side.
          Placed after the objectives band and before "how it works" on purpose:
          by this point the reader has been shown what buying gives them, and
          the honest next question is what happens when they want out. Every
          other tool in this market stops at the purchase. */}
      <section className="grid items-center gap-8 md:grid-cols-[1fr,1fr]">
        <div>
          <p className="text-sm font-semibold tracking-[0.2em] text-gold-700">
            The part nobody prepares you for
          </p>
          <h2 className="mt-3 text-2xl font-bold leading-tight text-ink md:text-3xl">
            One day you will want to sell. <br className="hidden md:block" />
            <span className="text-gold-700">We will still be here.</span>
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-muted">
            When that day comes, a broker sends a pricing sheet: a yield, a dirty price, a
            consideration, some charges. Every figure on it is accurate, and none of them answers
            the question you actually have — whether to do it at all. We work out what you really
            sell at, and what your next investment must earn for the swap to leave you no worse
            off.
          </p>
          <Link
            href="/sell/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-sand-400 bg-sand-50 px-6 py-3 font-display text-sm font-semibold text-ink transition hover:border-gold-500"
          >
            <ArrowRightLeft size={16} className="text-gold-700" /> Check a sale quote
          </Link>
        </div>
        <div className="card space-y-3">
          <p className="text-sm font-semibold text-ink-faint">
            From a real broker sheet
          </p>
          {[
            { k: 'Quoted to you', v: '12.50%', muted: true },
            { k: 'What you actually sell at', v: '12.57%' },
            { k: 'A taxed bond must then yield', v: '13.97%', accent: true },
          ].map(({ k, v, muted, accent }) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-sand-300/70 pb-2 last:border-0">
              <span className="text-sm text-ink-muted">{k}</span>
              <span className={`num shrink-0 font-semibold ${accent ? 'text-lg text-gold-700' : muted ? 'text-sm text-ink-faint' : 'text-sm text-ink'}`}>
                {v}
              </span>
            </div>
          ))}
          <p className="text-xs leading-relaxed text-ink-faint">
            A tax-free bond sold at 12.50% needs nearly <span className="num">14%</span> from
            ordinary paper to break even. Sell into a 13% bond thinking you have gained, and you
            have quietly lost income for the next thirteen years.
          </p>
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
    </div>
  );
}
