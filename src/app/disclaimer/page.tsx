import type { Metadata } from 'next';
import Prose from '@/components/shared/Prose';

export const metadata: Metadata = { title: 'Risk disclaimer — Mwangaza Yield' };

export default function DisclaimerPage() {
  return (
    <Prose
      title="Risk disclaimer"
      lead="Government bonds are among the safest shilling assets available. They are not risk-free."
      updated="25 July 2026"
    >
      <h2>Not advice</h2>
      <p>
        Mwangaza Yield is an educational analytics tool. It is not investment advice and not a
        recommendation to buy or sell. We are not licensed investment advisers. Consider licensed
        professional advice for your own circumstances.
      </p>

      <h2>The risks you are actually taking</h2>
      <ul>
        <li>
          <strong>Interest rate risk.</strong> Bond prices move inversely to rates. If you sell
          before maturity after rates have risen, you will realise a loss — the longer the bond, the
          sharper the move.
        </li>
        <li>
          <strong>Inflation risk.</strong> A fixed coupon loses purchasing power if inflation rises.
          At 6.4% inflation, a 12% net yield is roughly 5.6% in real terms.
        </li>
        <li>
          <strong>Liquidity risk.</strong> The Kenyan secondary market is thin for many issues. You
          may not be able to sell quickly at a fair price, which is why maturity-matching matters.
        </li>
        <li>
          <strong>Reinvestment risk.</strong> Coupons and maturing principal may only be
          reinvestable at lower rates. Rollover projections in this app assume today&apos;s rate
          holds, which it will not.
        </li>
        <li>
          <strong>Credit and policy risk.</strong> Sovereign default on domestic debt is remote but
          not impossible, and tax treatment can change — the withholding tax rules and the
          infrastructure bond exemption are set by legislation, which parliament can amend.
        </li>
      </ul>

      <h2>Limits of our calculations</h2>
      <ul>
        <li>Coupon dates run in exact 182-day steps from the issue date, which places every one on a Monday. They are not further adjusted for public holidays, so a payment CBK moves to the next working day will show here on the holiday itself.</li>
        <li>Accrued interest uses an Actual/364 convention, matching the 182-day coupon period. Verify against the prospectus for any bond whose schedule looks irregular.</li>
        <li>Yields without a published auction print are estimates from the prevailing curve.</li>
        <li>Projections assume rates hold and coupons are reinvested. Neither is guaranteed.</li>
        <li>Fees, levies and bank charges applicable to your own account are not modelled.</li>
      </ul>

      <h2>Before you invest</h2>
      <p>
        Read the official CBK prospectus for the specific issue, confirm the dates and terms, and
        make sure you can hold to maturity. Never invest money you may need before the bond matures.
      </p>
    </Prose>
  );
}
