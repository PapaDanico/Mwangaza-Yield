import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Tutorials — Mwangaza Yield',
  description: 'Learn how Kenyan government securities work, from your first Ksh 50,000 to a full ladder.',
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
          directions at once. A 91-day bill quoted at 8.79% prices at about 97.86 per 100. You earn
          2.14 on 97.86 spent over 91 days, and rolling that four times a year annualises to roughly{' '}
          <strong>9.08%</strong> — higher than the quote. Then 15% withholding tax takes it down to
          about <strong>7.68%</strong> — lower than the quote.
        </p>
        <p>
          The gap <strong>narrows</strong> with tenor, and this page said the opposite until 30 July
          2026. CBK&apos;s quote is already a simple annual yield on the price you pay, so the only
          thing the effective rate adds is compounding — and you can only compound what you can
          reinvest. A 91-day bill rolls four times a year and picks up about 29 basis points doing
          it; a 364-day bill is held once and lands within a hundredth of a point of its quote.
          Only the net figure is comparable to a bond&apos;s net yield.
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
          average rate the market clears at, and is available up to Ksh 50 million — this is what
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
  {
    n: '07',
    title: 'What to bid at an auction',
    minutes: 4,
    body: (
      <>
        <p>
          In a competitive bid you name a <strong>rate</strong>, and the direction is easy to get
          backwards: a <strong>low</strong> rate is the aggressive bid — you are offering the
          government cheap money, and if the auction clears above you, you are simply filled; bid
          below where it clears and CBK may never reach you. A <strong>high</strong> rate is the
          generous one — likely rejected when demand is strong, because CBK fills the cheapest
          money first and stops when the offer is covered.
        </p>
        <p>
          The evidence for a sensible number is public: every auction result CBK has published.
          Two traps in reading it. First, a <strong>re-opening</strong> keeps its original name, so
          a &ldquo;15-year&rdquo; bond may be sold with five years left — compare by time left to
          run, never by the label. Second, demand figures are per <em>auction</em>, not per bond —
          one auction often covers several bonds, and dividing one bond&apos;s bids by the whole
          auction&apos;s offer makes demand look far weaker than it is.
        </p>
        <p>
          Or skip the question: <strong>non-competitive bidding</strong> (up to Ksh 50 million)
          takes the weighted average rate the auction clears at, and is the right choice for almost
          every retail investor. Our auction radar shows where comparable paper has been clearing —
          and keeps a public record of its own predictions, scored against what actually happened.
        </p>
      </>
    ),
    cta: { href: '/auctions/', label: 'Open the auction radar' },
  },
  {
    n: '08',
    title: 'Selling before maturity, without being taken',
    minutes: 5,
    body: (
      <>
        <p>
          A broker&apos;s sale quote arrives as a wall of numbers: dirty price, clean price,
          accrued interest, consideration. The structure is simple. The <strong>clean price</strong>{' '}
          is the bond&apos;s market value per 100 of face value. <strong>Accrued interest</strong>{' '}
          is the share of the next coupon you have already earned by holding — the buyer owes it to
          you. Clean plus accrued is the <strong>dirty price</strong>, which is what the buyer
          actually pays. Then commission and levies come out of your side.
        </p>
        <p>
          Two questions decide whether the deal is fair. First: does the quoted price actually
          match the quoted yield? It is arithmetic, not opinion — and one detail can move the
          answer by thousands of shillings: some infrastructure bonds repay part of their principal
          early (<em>amortisation</em>), and pricing one as if all principal arrives at maturity
          overstates its value. Second: what must a <strong>replacement</strong> earn? Charges make
          your realised yield slightly worse than the headline, and if you are leaving a tax-free
          bond for a taxable one, the replacement must gross up for withholding tax just to break
          even. Selling a tax-free bond to buy a taxable one at the same rate is a pay cut.
        </p>
        <p>
          Our sale evaluator does all of this from the numbers on the quote itself — it reproduced
          a real broker&apos;s contract note to the cent before we shipped it.
        </p>
      </>
    ),
    cta: { href: '/sell/', label: 'Evaluate a sale quote' },
  },
  {
    n: '09',
    title: 'The rate is not the return: inflation',
    minutes: 4,
    body: (
      <>
        <p>
          Every figure this app has shown you until now is <strong>nominal</strong> — counted in
          shillings, without asking what those shillings will buy. A 13.6% coupon that leaves you
          11.56% after withholding tax sounds like getting meaningfully richer. At the CPI print
          published beside it, you are getting richer by about half that.
        </p>
        <p>
          Work it out by dividing, not subtracting. Real return is{' '}
          <strong>(1 + your return) ÷ (1 + inflation) − 1</strong>. Take a 12% net yield against 6%
          inflation: that is <strong>5.66%</strong>, where subtracting gives 6.00%. Thirty-four
          basis points sounds like pedantry; it is not, because the error grows with both rates
          and it always flatters you. Round numbers here to keep the arithmetic legible — the
          calculator uses the current rate, whatever it is today.
        </p>
        <p>
          Then there is the part a yield figure structurally cannot show. A bond returns a{' '}
          <strong>fixed nominal face value</strong> at maturity, however long it has been away. On
          a fifteen-year bond at 6% inflation, Ksh 100 of principal comes back worth about{' '}
          <strong>Ksh 42</strong> in today&apos;s money. On a long bond that is where most of the
          real loss lives, and no amount of coupon arithmetic reveals it.
        </p>
        <p>
          One consequence worth carrying: an infrastructure bond&apos;s tax exemption is worth
          proportionally <em>more</em> in real terms than in nominal ones, because the exempted
          amount is measured against a much smaller base once inflation has been taken off. Judging
          an IFB against an FXD on headline yield alone undervalues the IFB systematically.
        </p>
        <p>
          The calculator now shows all of this for whichever bond you are looking at, with the
          inflation rate on a slider — because holding one month&apos;s reading constant for
          fifteen years is an assumption, not a forecast. Kenyan inflation was above 9% as recently
          as 2023. Move it and watch what survives.
        </p>
      </>
    ),
    cta: { href: '/calculator/', label: 'See a bond in today\u2019s money' },
  },
  {
    n: '10',
    title: 'Is the price you were quoted a good one?',
    minutes: 4,
    body: (
      <>
        <p>
          A broker names a price. You have no idea whether it is generous, ordinary or poor, and
          Kenya publishes no secondary-market benchmark a retail buyer can check it against. This
          app holds no exchange prices at all — deliberately, because we hold no licence for them.
        </p>
        <p>
          What we do hold is <strong>every auction CBK has settled</strong>. So the question can be
          turned around: solve the yield your quoted price implies, and set it beside what
          comparable paper has actually been clearing at in the primary market. That does not make
          a quote right or wrong — but &ldquo;you are being offered 80 basis points less than the
          government has been paying for the same risk over the same horizon&rdquo; is a fact you
          can act on.
        </p>
        <p>
          Four things have to match or the comparison is noise.{' '}
          <strong>Gross against gross</strong>, because clearing rates are pre-tax.{' '}
          <strong>Tax status</strong>, because investors accept a lower gross yield on an IFB for
          the exemption — measured on our own archive, an IFB priced at par reads +509bps against a
          blended pool, which is an artefact and not an opportunity.{' '}
          <strong>Remaining term</strong>, never the tenor in the issue code, because re-openings
          keep their original code for life. And <strong>recency</strong>: the 7–12 year band
          medians 12.78% over the last year and 13.67% over two.
        </p>
        <p>
          All four at once is expensive. On the shipped archive this can judge 29 of the 58
          outstanding bonds; for the rest it says so rather than widening the net until it has
          something to say. A median of two prints dressed up as a market level would be worse than
          silence.
        </p>
      </>
    ),
    cta: { href: '/prices/', label: 'Check a quote you have been given' },
  },
];

export default function LearnPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">Tutorials</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">
          From your first Ksh 50,000 to a full ladder
        </h1>
        <p className="mt-2 text-lg text-ink-muted">
          Eight short lessons on how Kenyan government securities really work — written for people
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
              /* min-h-6 (24px) for WCAG 2.5.8. This is a standalone call to
                 action, not a link inside a sentence, so the inline exception
                 does not cover it — measured at 20px when every route was
                 driven in a browser. */
              className="mt-4 inline-flex min-h-6 items-center gap-1.5 text-sm font-semibold text-gold-700 underline-offset-2 hover:underline"
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
