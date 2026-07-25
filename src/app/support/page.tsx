import type { Metadata } from 'next';
import Prose from '@/components/shared/Prose';
import { SUPPORT_EMAIL } from '@/lib/share';

export const metadata: Metadata = { title: 'Support — Mwangaza Yield' };

export default function SupportPage() {
  return (
    <Prose title="Support" lead="How to get help, report a wrong number, or reach the official sources.">
      <h2>Found a figure that looks wrong?</h2>
      <p>
        Tell us — this matters more than any other kind of feedback. Every calculation in the app is
        open source and tested, but market data changes constantly and a stale or mistyped figure is
        always possible. Please include the page, the number you saw, and what you believe it should
        be.
      </p>
      <p>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Mwangaza Yield — a figure that looks wrong')}`}>
          Email {SUPPORT_EMAIL} →
        </a>
      </p>

      <h2>Official sources — always check these first</h2>
      <ul>
        <li>
          <a href="https://www.centralbank.go.ke/securities/treasury-bonds/treasury-bonds-prospectuses/" target="_blank" rel="noopener noreferrer">
            CBK Treasury bond prospectuses
          </a>{' '}
          — the authority on coupons, dates and terms.
        </li>
        <li>
          <a href="https://www.centralbank.go.ke/securities/treasury-bills/" target="_blank" rel="noopener noreferrer">
            CBK Treasury bills
          </a>{' '}
          — weekly auction results.
        </li>
        <li>
          <a href="https://whatsapp.com/channel/0029Va5HrcD4dTnNnTguwc24" target="_blank" rel="noopener noreferrer">
            CBK&apos;s WhatsApp channel
          </a>{' '}
          — announcements as they publish.
        </li>
        <li>
          <a href="https://dhowcsd.centralbank.go.ke/" target="_blank" rel="noopener noreferrer">DhowCSD</a>{' '}
          — where you register and bid.
        </li>
      </ul>

      <h2>Account and bidding problems</h2>
      <p>
        We cannot help with CSD registration, bids, settlement or payments — we have no access to
        your account and no relationship with the Central Bank. For those, contact CBK&apos;s
        Financial Markets Department or your bank directly. Never share your CSD credentials,
        National ID or KRA PIN with us or anyone claiming to represent us; we will never ask.
      </p>

      <h2>Common fixes</h2>
      <ul>
        <li><strong>Stale figures?</strong> You may be offline — the header shows a badge when data is cached. Reconnect and reload.</li>
        <li><strong>CSV import skipped rows?</strong> The file needs the columns <code>issueCode, faceValueKES, purchaseDate, purchaseCleanPrice</code>. The import summary names any issue codes it did not recognise.</li>
        <li><strong>Holdings disappeared?</strong> They live in your browser storage — clearing browsing data, or switching browser or device, removes them. There is no cloud copy by design.</li>
      </ul>

      <h2>Feature requests</h2>
      <p>
        Ideas are welcome, especially from people investing their own money. The most useful
        requests describe the decision you are trying to make, not the feature you imagine.
      </p>
    </Prose>
  );
}
