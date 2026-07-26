import type { Metadata } from 'next';
import Prose from '@/components/shared/Prose';

export const metadata: Metadata = { title: 'FAQs — Mwangaza Yield' };

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'How much do I need to start?',
    a: (
      <>
        KES 50,000 for most Treasury bonds, KES 100,000 for infrastructure bonds and Treasury
        bills, then top-ups in multiples of KES 50,000. You bid through DhowCSD directly — there is
        no broker fee.
      </>
    ),
  },
  {
    q: 'Why is my net yield lower than the coupon I was quoted?',
    a: (
      <>
        Two reasons. First, withholding tax: 15% on bonds under ten years, 10% on ten years and
        over, and 0% on infrastructure bonds. Second, price: if you buy above par (over 100) your
        yield is below the coupon, and below par it is above. Our calculator solves the yield from
        the price you actually pay, so both effects are already in the number.
      </>
    ),
  },
  {
    q: 'Are infrastructure bonds really tax-free?',
    a: (
      <>
        Yes — coupon income on IFBs is exempt from withholding tax. That is why an IFB paying a
        lower coupon often beats a higher-coupon FXD on a net basis, and why our dashboard compares
        the two side by side rather than ranking on headline coupon.
      </>
    ),
  },
  {
    q: 'A T-bill is quoted at 8.8%. Is that what I earn?',
    a: (
      <>
        No, and it is wrong in both directions. Bills are sold at a discount, so the true gross
        yield is <em>higher</em> than the quoted rate — then 15% withholding tax pulls the net
        <em> below</em> it. Our Treasury Bills page shows all three numbers together.
      </>
    ),
  },
  {
    q: 'What is a bond ladder and why would I want one?',
    a: (
      <>
        A ladder holds several bonds maturing in different years instead of one big holding. Money
        comes back at intervals rather than all at once, so you can meet known expenses without
        selling at whatever price the market offers, and you reinvest gradually rather than betting
        everything on one day&apos;s rate.
      </>
    ),
  },
  {
    q: 'Can I lose money on a government bond?',
    a: (
      <>
        The Kenyan government has never defaulted on a shilling-denominated bond, so if you hold to
        maturity you expect your principal back. But you can lose money by selling early: bond
        prices fall when rates rise. Inflation is the other risk — a 12% net yield with 6.4%
        inflation is roughly 5.6% in real purchasing power.
      </>
    ),
  },
  {
    q: 'How do I actually buy?',
    a: (
      <>
        Register for a CSD account at dhowcsd.centralbank.go.ke with your ID, KRA PIN and bank
        details, wait for approval, then bid before the offer closes. Retail investors should
        normally choose non-competitive bidding, which takes the weighted average rate rather than
        requiring you to guess one. Our Auction Radar has the full step-by-step guide.
      </>
    ),
  },
  {
    q: 'Where does your data come from, and how fresh is it?',
    a: (
      <>
        Published CBK auction results and prospectuses, National Treasury material and KNBS inflation
        releases — and nothing else. We use no exchange price data of any kind, so a bond&rsquo;s
        market price is the one thing only you can supply. Figures are labelled with their source and date. Some values — coupon dates
        derived from issue schedules, and yields without an auction print — are estimates, and the
        app says so where they appear. Always confirm against the official prospectus.
      </>
    ),
  },
  {
    q: 'Do you see my portfolio?',
    a: (
      <>
        No. There is no account and no server storing your data — holdings live in your browser on
        your device. See our <a href="/privacy/">privacy policy</a>.
      </>
    ),
  },
  {
    q: 'Does it work offline?',
    a: (
      <>
        Yes. Add it to your home screen and it installs like an app. Pages and the last market data
        you loaded are cached, so calculations keep working with no signal — the badge in the header
        tells you when you are seeing cached figures.
      </>
    ),
  },
  {
    q: 'Is it free? What is the catch?',
    a: (
      <>
        It is free, with no ads and no data collection. The app is static files and client-side
        maths, so it costs almost nothing to run.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <Prose title="Frequently asked questions" lead="Short answers about Kenyan government securities and this app.">
      {FAQS.map(({ q, a }) => (
        <details key={q} className="group rounded-xl border border-sand-300 bg-sand-50 p-4 open:border-gold-500/60">
          <summary className="cursor-pointer list-none font-display font-semibold text-ink marker:content-none">
            <span className="mr-2 text-gold-600 transition group-open:rotate-90 inline-block">›</span>
            {q}
          </summary>
          <p className="mt-3 pl-5">{a}</p>
        </details>
      ))}
      <p className="pt-2 text-xs text-ink-faint">
        Something missing? Ask on <a href="/support/">Support</a>.
      </p>
    </Prose>
  );
}
