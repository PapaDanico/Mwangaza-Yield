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
