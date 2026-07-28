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
