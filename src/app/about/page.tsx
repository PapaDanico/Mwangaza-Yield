import type { Metadata } from 'next';
import Prose from '@/components/shared/Prose';
import { SUPPORT_EMAIL } from '@/lib/share';

export const metadata: Metadata = { title: 'About us — Mwangaza Yield' };

export default function AboutPage() {
  return (
    <Prose
      title="About Mwangaza Yield"
      lead="Mwangaza means light. We shine it on what Kenyan government securities actually pay."
    >
      <h2>Why this exists</h2>
      <p>
        Kenya has one of the most accessible government securities markets in Africa. Since
        DhowCSD opened direct participation, anyone with a KRA PIN and KES 50,000 can lend to the
        government on the same terms as a bank. Yet the numbers that reach retail investors are
        almost never the numbers they will actually receive.
      </p>
      <p>
        A bond advertised at a 16% coupon does not pay 16% if you buy it above par. A Treasury bill
        quoted at 8.80% earns more than that in true yield — then less than that after withholding
        tax. Two investors buying the same bond on the same day can end up with different net
        returns depending on tenor, because withholding tax is 10% above ten years and 15% below,
        and 0% on infrastructure bonds. None of this is secret. It is simply never calculated for
        the person doing the investing.
      </p>
      <p>Mwangaza Yield calculates it. Every figure in this app is stated <strong>after tax</strong>.</p>

      <h2>The mark</h2>
      <p>
        The dhow is deliberate. It is the vessel of the East African coast, and the namesake of
        DhowCSD — the Central Bank platform this entire market now runs on. Its sail carries a
        rising yield curve, because the point of the boat is to take you somewhere. Treasury navy
        for the institution, sun gold for the light, emerald for growth.
      </p>

      <h2>What we are not</h2>
      <ul>
        <li>We are not a broker. You cannot buy anything here — you bid on DhowCSD, directly with CBK, with no intermediary taking a cut.</li>
        <li>We are not licensed to give investment advice, and nothing here is a recommendation to buy or sell.</li>
        <li>We are not affiliated with the Central Bank of Kenya, the NSE, or the Capital Markets Authority.</li>
        <li>We do not want your money, your ID, or your account. There is no sign-up because there is nothing to sign up to.</li>
      </ul>

      <h2>How it is built</h2>
      <p>
        Everything runs in your browser. The financial engine — accrued interest, yield solving,
        withholding tax, ladder construction — is plain arithmetic executing on your device, tested
        against known values on every change. Market data is published as static files sourced from
        CBK and KNBS. Your portfolio lives in your phone&apos;s local storage and is never
        transmitted anywhere.
      </p>
      <p>
        That architecture is a deliberate response to how people actually use phones in Kenya: the
        app installs to your home screen, works with no signal, and costs nothing to open. It is
        also why we can promise privacy without asking you to trust us — we could not read your
        data if we wanted to.
      </p>

      <h2>Get in touch</h2>
      <p>
        Corrections to the maths or the data are especially welcome — a wrong number helps nobody,
        and the people most likely to spot one are the people using it. Write to{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or see{' '}
        <a href="/support/">Support</a> for what to include.
      </p>
    </Prose>
  );
}
