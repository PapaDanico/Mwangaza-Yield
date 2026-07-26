import type { Metadata } from 'next';
import Prose from '@/components/shared/Prose';
import { SUPPORT_EMAIL } from '@/lib/share';

export const metadata: Metadata = { title: 'Terms of use — Mwangaza Yield' };

export default function TermsPage() {
  return (
    <Prose
      title="Terms of use"
      lead="Plain terms for a free analytics tool."
      updated="25 July 2026"
    >
      <h2>1. What you are using</h2>
      <p>
        Mwangaza Yield is a free, informational analytics tool for Kenyan government securities. By
        using it you agree to these terms. If you do not agree, please do not use the app.
      </p>

      <h2>2. Not investment advice</h2>
      <p>
        Nothing in this app is investment, tax or legal advice, a recommendation, or an offer or
        solicitation to buy or sell any security. We are not licensed by the Capital Markets
        Authority as an investment adviser or dealer. Outputs are illustrative calculations based
        on the inputs you provide and on published market data. Decisions you make are your own.
        Consider taking licensed professional advice before investing.
      </p>

      <h2>3. No affiliation</h2>
      <p>
        We are independent and are not affiliated with, authorised by, or endorsed by the Central
        Bank of Kenya, DhowCSD, the Nairobi Securities Exchange, the Kenya National Bureau of
        Statistics, or the Capital Markets Authority. Their names and data are referenced for
        identification and attribution only.
      </p>

      <h2>4. Accuracy and availability</h2>
      <p>
        Market data may be delayed, incomplete, estimated or wrong. Some values — notably coupon
        dates derived from issue schedules, and yields where no auction print exists — are
        explicitly estimates and are labelled as such in the app. Always verify against the
        official CBK prospectus or auction results before committing money. The service is provided
        &ldquo;as is&rdquo; with no warranty of accuracy, availability or fitness for a particular
        purpose, and may change or stop at any time.
      </p>

      <h2>5. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by Kenyan law, we accept no liability for any loss —
        including investment losses, lost profits or lost data — arising from your use of, or
        reliance on, this app. Because the app is free and holds none of your money, your sole
        remedy is to stop using it.
      </p>

      <h2>6. Your responsibilities</h2>
      <ul>
        <li>Use the app lawfully and not to mislead others.</li>
        <li>Verify figures independently before investing.</li>
        <li>Keep your own device secure — your portfolio data is stored on it, and its safety is in your hands.</li>
      </ul>

      <h2>7. Intellectual property</h2>
      <p>
        The Mwangaza Yield name, logo, brand and application code are ours. Underlying data belongs to
        its publishers — the Central Bank of Kenya, the National Treasury and the Kenya National
        Bureau of Statistics — and is used here on the terms on which they publish it. We use no
        Nairobi Securities Exchange data of any kind. For licensing or reuse enquiries, write to{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>8. Governing law</h2>
      <p>These terms are governed by the laws of Kenya.</p>

      <h2>9. Changes</h2>
      <p>
        We may update these terms; the date above shows the current version. Continuing to use the
        app after a change means you accept it.
      </p>
    </Prose>
  );
}
