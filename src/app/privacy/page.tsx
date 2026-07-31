import type { Metadata } from 'next';
import Prose from '@/components/shared/Prose';
import { SUPPORT_EMAIL } from '@/lib/share';

export const metadata: Metadata = { title: 'Privacy policy — Mwangaza Yield' };

export default function PrivacyPage() {
  return (
    <Prose
      title="Privacy policy"
      lead="Everything you enter stays on your device. The one exception is price alerts, which you have to switch on — and this page says exactly what that stores."
      updated="31 July 2026"
    >
      {/* Named, because this page ends by pointing readers at the ODPC.
          Sending somebody to complain about an entity the notice will not
          identify is not a complaint route — and s.29 of the Data Protection
          Act makes naming the controller part of the duty this page exists to
          discharge.

          Company number and incorporation date are taken from the certificate
          of incorporation, a public record at the BRS.

          The address is the BUSINESS address and is deliberately not the
          registered office. The certificate gives a registered office on the
          Ongata Rongai-Kitengela Bypass; that stays on the BRS record, where
          anyone can pull it by company number, and off this page. Calling JKIA
          Cargo Centre the registered office would be false — the fix for a
          personal address on a public page is never to relabel a different
          one. If someone later "corrects" this back believing it a mistake: it
          was not.
          Deliberately NOT taken from it: the director's name, the shareholding,
          and the registry's "P.O. Box" field, which on this certificate holds a
          MOBILE NUMBER rather than a box number. A government form labelling a
          phone number as an address does not make publishing it our business —
          least of all on the page about how carefully we handle personal
          data. */}
      <h2>Who we are</h2>
      <p>
        Mwangaza Yield is operated by <strong>Danico Ventures Ltd</strong> (company no.{' '}
        <strong>PVT-EYUM572</strong>, incorporated 10 March 2019 under the Companies Act, 2015),
        which also runs JiPange and is the data controller for anything described on this page.
        Business address: JKIA Cargo Centre, Nairobi. Write to us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — including to exercise any of the
        rights set out below.
      </p>

      <h2>The short version</h2>
      <p>
        Mwangaza Yield has no user accounts and no login. Everything you enter — amounts, holdings,
        prices, goals — is computed on your own device and saved only in your browser&apos;s local
        storage (IndexedDB). It never leaves your phone or computer.
      </p>
      <p>
        There is exactly one thing we store on a server, and only if you switch it on:{' '}
        <strong>price alerts</strong>. That is set out in full below rather than tucked into a
        clause, because a privacy notice that omits the one server-side thing is not a privacy
        notice.
      </p>
      <p className="text-sm">
        This page follows the duty to notify in <strong>section 29</strong> of Kenya&apos;s{' '}
        <strong>Data Protection Act, 2019</strong> — what is held, why, who else receives it, how it
        is protected, and what you can do about it.
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

      <h2>Price alerts — the one thing we store</h2>
      <p>
        If you turn on alerts, your browser issues a <strong>push endpoint</strong>: a long URL that
        the browser vendor&apos;s push service can deliver a message to, plus two keys that let us
        encrypt it. We store that endpoint, those keys, and the market-wide rules you chose — an
        auction date, a rate threshold. Nothing else. There is no name, no email, no device
        identifier we could resolve to a person, and no way to work backwards from what we hold to
        who you are.
      </p>
      <p>
        <strong>It never contains anything about your money.</strong> An alert can say &ldquo;the
        91-day bill cleared above 9%&rdquo;, because that is a fact about the market. It cannot say
        anything about your holdings, because the sender does not have them — the rules you can
        subscribe to are checked against a whitelist on the server, so a modified client cannot
        smuggle a holding into the store even deliberately.
      </p>
      <p>
        The record is keyed by a SHA-256 hash of the endpoint, which lets us find your subscription
        to update or delete it and lets us enumerate nothing else. Turning alerts off deletes it.
        The subscription lives in Netlify Blobs, which sits outside Kenya — a transfer the Act asks
        us to name, so we are naming it.
      </p>

      <h2>Your rights</h2>
      <p>
        Section 26 of the Data Protection Act, 2019 gives you the right to be informed about how
        your data is used, to access it, to object to its processing, and to have inaccurate data
        corrected or deleted. This app is built so that most of those are things you can do
        yourself, immediately, without asking us:
      </p>
      <ul>
        <li><strong>Access and correction</strong> — your data is on your device, in front of you. Every figure can be edited on the page that shows it.</li>
        <li><strong>Deletion</strong> — &ldquo;Clear all holdings&rdquo; on the portfolio page, or clearing site data in your browser. For alerts, switching them off deletes the stored subscription.</li>
        <li><strong>Objection</strong> — do not turn on alerts. Nothing else about the app sends anything anywhere, so there is nothing else to object to.</li>
      </ul>
      <p>
        If you believe your rights have been infringed you may complain to the{' '}
        <a href="https://www.odpc.go.ke" target="_blank" rel="noopener noreferrer">
          Office of the Data Protection Commissioner
        </a>
        , the supervisory authority for data protection in Kenya. You do not have to come to us
        first.
      </p>

      <h2>Links away from the app</h2>
      <p>
        We link to the Central Bank of Kenya, the National Treasury, KNBS, CBK&apos;s WhatsApp
        channel, and our own WhatsApp channel, Pesa Smart KE, which we run jointly with JiPange.
        Once
        you follow a link you are on their service, under their privacy policy, not ours. Sharing a
        summary to WhatsApp hands that text to WhatsApp — we neither see nor keep a copy.
      </p>
      <p>
        Following our channel does not identify you to us. WhatsApp does not show channel admins who
        their followers are, so we never see your number and are never given a list — following is
        the one way to hear from us that costs you nothing in privacy. It is a broadcast: we post,
        you read. It carries market news only, never anything about your own holdings, because
        working those out needs data this app deliberately never receives.
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
