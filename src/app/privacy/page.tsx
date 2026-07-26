import type { Metadata } from 'next';
import Prose from '@/components/shared/Prose';

export const metadata: Metadata = { title: 'Privacy policy — Mwangaza Yield' };

export default function PrivacyPage() {
  return (
    <Prose
      title="Privacy policy"
      lead="We do not collect your personal data, because the app has nowhere to send it."
      updated="25 July 2026"
    >
      <h2>The short version</h2>
      <p>
        Mwangaza Yield has no user accounts, no login, and no server that stores anything about
        you. Everything you enter — amounts, holdings, goals — is computed on your own device and
        saved only in your browser&apos;s local storage (IndexedDB). It never leaves your phone or
        computer.
      </p>

      <h2>What we store, and where</h2>
      <ul>
        <li><strong>Your portfolio and imported CSV data</strong> — stored locally in your browser only. Clearing your browser data or tapping &ldquo;Clear all holdings&rdquo; deletes it permanently. We cannot recover it, because we never had it.</li>
        <li><strong>Prices you record</strong> — the bond prices you enter in your price book stay in the same local database as your holdings. They are never uploaded, and we never fetch prices on your behalf, from anyone. We publish no market prices at all.</li>
        <li><strong>Market data</strong> — bond, bill, auction and macro figures are downloaded to your device and cached so the app works offline. This is public information flowing to you, not data flowing from you.</li>
        <li><strong>No cookies</strong> are set for tracking, advertising or profiling.</li>
      </ul>

      <h2>What our host can see</h2>
      <p>
        The site is served as static files by Netlify. Like any web host, Netlify processes standard
        server request data (IP address, browser type, pages requested) to deliver the site and
        protect it from abuse. Fonts are served from our own domain rather than a third party, so
        loading a page does not notify anyone else that you did.
      </p>
      <p>
        We run our own <strong>tool counter</strong> — a first-party tally of which tools get used,
        hosted alongside the site with no third party involved. It sets no cookies, records no IP
        address, and carries no identifier of any kind: the stored record is a name like
        &ldquo;calculator&rdquo; next to a number, per day. Two visits by you are indistinguishable
        from one visit each by two people — deliberately, which is why this page carries no consent
        banner. It exists for one reason: to know which tools are worth continuing to build. If your
        browser sends Do Not Track or Global Privacy Control, we do not count you at all.
      </p>
      <p>
        It counts tool use only. It cannot see the figures you type, the holdings you import or
        the goals you set, because those never leave your device — that is a property of how the app
        is built, not a promise about how we behave.
      </p>

      <h2>Links away from the app</h2>
      <p>
        We link to the Central Bank of Kenya, the National Treasury, KNBS and CBK&apos;s WhatsApp
        channel. Once
        you follow a link you are on their service, under their privacy policy, not ours. Sharing a
        summary to WhatsApp hands that text to WhatsApp — we neither see nor keep a copy.
      </p>

      <h2>Children</h2>
      <p>
        The app is intended for adults able to hold a CSD account. We do not knowingly collect
        information from anyone — a promise that is easy to keep given we collect none at all.
      </p>

      <h2>Your rights</h2>
      <p>
        Kenya&apos;s Data Protection Act, 2019 gives you rights over personal data held about you.
        Because we hold none, there is nothing for us to disclose, correct or erase on request —
        your data is already exclusively in your own hands. If that ever changes, this page will
        change first, and the date above will say so.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy can be raised through <a href="/support/">Support</a>.
      </p>
    </Prose>
  );
}
