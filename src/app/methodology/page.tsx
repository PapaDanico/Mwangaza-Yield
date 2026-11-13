import type { Metadata } from 'next';
import Link from 'next/link';
import Prose from '@/components/shared/Prose';

export const metadata: Metadata = {
  title: 'How we calculate — Mwangaza Yield',
  description: 'The conventions behind every figure: coupon dates, yield, withholding tax, bill pricing, prices and what the tools do not model.',
};

export default function MethodologyPage() {
  return (
    <Prose
      title="How we calculate"
      lead="The conventions behind the numbers, so you can check them against a CBK prospectus or your DhowCSD statement."
    >
      <h2>Bonds</h2>
      <ul>
        <li>
          <strong>Coupon dates</strong> run in whole 182-day periods counted back from maturity, which is how CBK&apos;s own pricing tables
          land. A coupon that falls on a weekend or public holiday is paid on the next business day; the ladder and calendar exports show
          both the scheduled and the paid date.
        </li>
        <li>
          <strong>Yield</strong> is annualised on a 364-day year with semi-annual compounding. Net yield is the same calculation with
          coupons after withholding tax. It assumes you hold to maturity and that each coupon is reinvested at the same yield.
        </li>
        <li>
          <strong>Price</strong> is quoted clean, per 100 of face value. What you pay is the dirty price, the clean price plus the interest
          accrued since the last coupon. Our accrued interest follows the same 182-day period.
        </li>
        <li>
          <strong>Withholding tax</strong> on bond interest is 15% for bonds under ten years and 10% for ten years or more.
          Infrastructure bonds are exempt. Tax is applied to coupons; the principal and any discount are not taxed in these figures.
        </li>
      </ul>

      <h2>Treasury bills</h2>
      <ul>
        <li>
          CBK quotes the average rate as a <strong>true discount</strong>: price = 100 ÷ (1 + rate × days ÷ 365). The effective annual yield
          compounds that over a 365-day year. This is not the same as the bank-discount convention some sites use, and the difference is
          largest on the 364-day bill.
        </li>
        <li>Withholding tax on bill interest is 15%, applied to the gain.</li>
      </ul>

      <h2>Comparing a bill with a bond</h2>
      <p>
        The <Link href="/tbills/">bill-or-bond comparison</Link> puts both on the same money and the same end date, the bond&apos;s maturity,
        after tax. Bills are rolled at a short rate you choose, and bond coupons are reinvested in bills at that same rate, so the only
        difference is what the bond locks in. The answer is the average short rate at which the two finish level. It is a scenario, not a
        forecast, and it ignores brokerage and any sale before maturity.
      </p>

      <h2>Selling before maturity</h2>
      <p>
        The <Link href="/sell/">early-sale tool</Link> recomputes your quote independently: accrued interest, the yield you are really
        selling at once charges are taken out, and the yield a replacement must beat. The &ldquo;if yields move&rdquo; table reprices the
        bond exactly from its own coupons and dates; it is a what-if, and it leaves out charges.
      </p>

      <h2>Where the figures come from</h2>
      <p>
        Auction results, bond terms and exchange rates are entered from CBK notices, and each record states how it arrived and which
        document it came from. A figure we could not source is shown as unavailable, never as zero or as the last known value. A figure
        past its publisher&apos;s usual schedule is flagged on the page. The full list is on <Link href="/sources/">Sources</Link>.
      </p>

      <h2>Prices, and what &ldquo;par&rdquo; means here</h2>
      <p>
        A price is shown as <em>your price</em>, <em>last traded</em> or <em>par</em>. Par means we hold no price for that bond and 100 is a
        placeholder, not the market. Any result built on par says so.
      </p>

      <h2>What these tools do not do</h2>
      <ul>
        <li>They assume no purchase charge unless you enter one: the net-yield calculator has a field for a bank or broker fee, and adds it to the cost. We found no CBK fee for bidding yourself on DhowCSD, but check its current terms; banks and brokers set their own tariffs, which we do not publish because we could not verify current ones.</li>
        <li>They do not forecast rates, prices or auction outcomes with certainty. Bid guidance is a measured estimate with a published track record.</li>
        <li>They are not investment advice. Check terms against the CBK prospectus before you invest.</li>
      </ul>

      <p>
        Spotted a figure or a convention that looks wrong? See <Link href="/support/">Support</Link>; corrections to the maths are the most useful
        feedback we get.
      </p>
    </Prose>
  );
}
