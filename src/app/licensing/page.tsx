import type { Metadata } from 'next';
import Prose from '@/components/shared/Prose';
import { INSTITUTION_PRODUCTS, FUNDING_NARRATIVE } from '@/lib/tiers';
import { NOT_ADVICE } from '@/lib/provenance';
import { SUPPORT_EMAIL } from '@/lib/share';

export const metadata: Metadata = {
  title: 'Licensing — Mwangaza Yield',
  description:
    'Free to individuals, permanently. The engine behind it is licensed to SACCOs, fund managers and advisers.',
};

export default function LicensingPage() {
  return (
    <Prose
      title={FUNDING_NARRATIVE.heading}
      lead={FUNDING_NARRATIVE.lead}
    >
      {FUNDING_NARRATIVE.body.map((para) => (
        <p key={para.slice(0, 24)}>{para}</p>
      ))}

      <h2>What institutions license</h2>
      {INSTITUTION_PRODUCTS.map((p) => (
        <div key={p.id}>
          <h3>{p.name}</h3>
          <p>{p.summary}</p>
          <p className="text-sm text-ink-faint">For: {p.buyer}</p>
        </div>
      ))}

      <h2>Three ways to work together</h2>
      <p>
        The same engine, offered three ways. Which one fits depends on whether you want it inside
        your own product, in front of the people you already serve, or pointed at something only
        you can see.
      </p>
      <h3>Embed</h3>
      <p>
        The calculations run inside your platform, under your brand. You hold whatever licence your
        own advice requires; we supply the arithmetic and the sources behind it.
      </p>
      <h3>Distribute</h3>
      <p>
        Hand both tools to your members, staff or customers as something useful and free. Nothing
        is asked of them — no account, no data, no charge — so there is nothing for you to explain
        away later.
      </p>
      <h3>Co-build</h3>
      <p>
        A module aimed at your mandate — a SACCO&apos;s share-capital maths, a pension provider&apos;s
        contribution planner, an employer&apos;s leavers&apos; pack. You fund the build; it stays free
        to the people who use it.
      </p>

      {/* The deck, offered rather than embedded.
        *
        * A slide deck is a poor way to read an argument and a fine way to take
        * one into a meeting, so the argument is on this page as text and the
        * file sits beside it. The size is stated because on Kenyan mobile data
        * an unlabelled download is a small act of rudeness. */}
      {/* THE DATA, BEFORE THE CONVERSATION.
        *
        * REVENUE.md §2: the buyer's analyst lives in a spreadsheet, and a
        * prospect who has to ask for a sample does not ask. The feed was
        * already public; this page never said so. */}
      <h2>Look at the data first</h2>
      <p>
        The figures the engine produces are published as a free feed, so you can judge them before
        writing to anyone. It covers each Treasury bill tenor and bond maturity band: the rate CBK
        published, the rate after withholding tax, the tax rate applied, how many auction results
        each figure rests on, and the date and source of every one.
      </p>
      <p>
        <a href="/data/rates.csv" download>
          Download as a spreadsheet (CSV) →
        </a>{' '}
        <span className="text-sm text-ink-faint">(2 KB, opens in Excel)</span>
        <br />
        <a href="/data/rates.json">The same figures as JSON →</a>{' '}
        <span className="text-sm text-ink-faint">(5 KB, for developers; cross-origin reads allowed)</span>
      </p>
      <p>
        Why the arithmetic matters: one common spreadsheet day-count convention overstated a single
        bond (<span className="num">FXD2/2018/20</span>) by{' '}
        <span className="num">Ksh 61,836</span> per million, and by an average of{' '}
        <span className="num">Ksh 7,923</span> per million across all 58 bonds then listed. On a
        book of hundreds of millions, that is real money priced wrongly.
      </p>

      {/* THE PRICE, STATED. REVENUE.md §2: "a prospect who has to ask does
        * not ask." Set by the owner on 4 Oct 2026 at the plan's own sizing of
        * one SACCO pilot. */}
      <h2>What it costs</h2>
      <p>
        Pilots for SACCOs, fund managers and advisers start from{' '}
        <span className="num font-semibold">Ksh 150,000</span> a year for the first year,
        with the scope and price confirmed in writing before anything is signed. The tools stay
        free to individuals either way.
      </p>

      <h2>The full case, if you want it on paper</h2>
      <p>
        Everything above is the short version. The partnership deck sets out the gap it addresses,
        what both platforms do, how they fit together, and what the commercial arrangement looks
        like — with every figure sourced and dated.
      </p>
      <p>
        <a href="/partners/jipange-mwangaza-partnership-deck.pptx" download>
          Download the partnership deck →
        </a>{' '}
        <span className="text-sm text-ink-faint">(PowerPoint, 132 KB)</span>
      </p>

      <h2>If that is you</h2>
      <p>
        Tell us what you are trying to do for the people you serve, and we will tell you plainly
        whether this helps. If it does not, we will say so — there is no version of this worth
        selling into a place it does not fit.
      </p>
      <p>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Mwangaza Yield — licensing enquiry')}`}
        >
          Email {SUPPORT_EMAIL} →
        </a>
      </p>

      <h2>What stays true either way</h2>
      <p>{FUNDING_NARRATIVE.reassurance}</p>
      <p className="text-sm text-ink-faint">{NOT_ADVICE}</p>
    </Prose>
  );
}
