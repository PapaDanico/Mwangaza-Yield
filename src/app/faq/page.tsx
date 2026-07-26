import type { Metadata } from 'next';
import Prose from '@/components/shared/Prose';

export const metadata: Metadata = { title: 'FAQs — Mwangaza Yield' };

const FAQS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'How much do I need to start?',
    a: (
      <>
        Ksh 50,000 for most Treasury bonds, Ksh 100,000 for infrastructure bonds and Treasury
        bills, then top-ups in multiples of Ksh 50,000. You bid through DhowCSD directly — there is
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
    q: 'My bond pays 11.5% after tax. Am I actually getting richer?',
    a: (
      <>
        <p>
          Partly. Every figure quoted anywhere in Kenyan finance is <strong>nominal</strong> —
          counted in shillings, without asking what those shillings will buy. At the CPI figure we
          publish, an 11.56% net yield is about <strong>4.84% real</strong>. You are getting ahead,
          by roughly half as much as the headline suggests.
        </p>
        <p>
          Divide rather than subtract — (1 + return) ÷ (1 + inflation) − 1. Subtracting gives 5.15%
          here, which overstates by 31 basis points, and the error grows as rates rise. The
          calculator shows the real figure for every bond, with the inflation rate on a slider so
          you can disagree with our assumption rather than inherit it.
        </p>
      </>
    ),
  },
  {
    q: 'If the principal is guaranteed, how can I lose purchasing power?',
    a: (
      <>
        <p>
          Because the guarantee is in shillings, not in what they buy. A bond returns a fixed
          nominal face value whenever it matures. At 6.41% inflation, Ksh 100 repaid in fifteen
          years buys roughly what <strong>Ksh 39</strong> buys today — and no yield figure shows
          this, because it is not a yield effect at all.
        </p>
        <p>
          The longer the bond, the more of the real loss sits in the principal rather than the
          coupon. It is the strongest argument for not treating a thirty-year bond as simply a
          higher-yielding version of a three-year one.
        </p>
      </>
    ),
  },
  {
    q: 'A broker quoted me a price. How do I know it is fair?',
    a: (
      <>
        <p>
          Record it on the price book and the app solves the yield that price implies, then sets it
          beside what comparable paper has actually cleared at in recent CBK auctions. Kenya
          publishes no retail secondary benchmark and we hold no exchange prices, so the primary
          market is the honest yardstick available.
        </p>
        <p>
          Comparable means four things at once: the same tax treatment, roughly the same time left
          to run, gross measured against gross, and recent. On the current archive that is
          answerable for 29 of the 58 outstanding bonds — for the rest the app says so rather than
          quoting a level built on two prints.
        </p>
      </>
    ),
  },
  {
    q: 'Should I always pick the bond with the highest yield?',
    a: (
      <>
        <p>
          No, and three things in this app exist because of how often that goes wrong. Compare{' '}
          <strong>after tax</strong> — a tax-free 12.8% infrastructure bond beats a taxable 14%.
          Compare <strong>after inflation</strong>, or a high nominal yield in a high-inflation year
          can leave you standing still. And match the <strong>maturity to when you need the
          money</strong>: the highest yield on the board is no use if it repays four years after the
          school fees are due.
        </p>
        <p>
          One bond is also not a plan. That is what the ladder is for — and why the goal planners
          start from what the money is for rather than from a rate.
        </p>
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
          {/*
            A div, not a p.

            Answers used to be a single run of inline text, so a <p> wrapper
            was harmless. The moment one contained its own <p> — which the
            longer answers need — the nesting became invalid, the browser
            silently restructured the DOM to close the outer paragraph, and the
            result no longer matched React's server HTML. That is React errors
            #418 and #423, and the whole tree gets thrown away and re-rendered
            on the client. Invisible on the page, caught by the browser suite.
          */}
          <div className="mt-3 space-y-3 pl-5">{a}</div>
        </details>
      ))}
      <p className="pt-2 text-xs text-ink-faint">
        Something missing? Ask on <a href="/support/">Support</a>.
      </p>
    </Prose>
  );
}
