import Link from 'next/link';
import ToolShell from '@/components/shared/ToolShell';
import TbillsClient from './TbillsClient';

export default function Page() {
  return (
    <ToolShell
      title="Lending for months, not years"
      intro={
        <>
          Treasury bills run 91, 182 or 364 days. You pay less than Ksh 100 now and are repaid
          the full 100 at the end — the gap is your interest. Sold every Thursday, and taxed at
          15% on that gap.
        </>
      }
      after={
        <>
          <h2>Why the quoted rate is not what you earn</h2>
          <p>
            CBK quotes a <strong>true discount</strong>: the price per Ksh 100 is{' '}
            <span className="num">100 / (1 + rate × days / 365)</span>, and the yield you actually
            earn is <span className="num">(100 / price) ^ (365 / days) − 1</span>. Because you pay
            less than 100 and are repaid 100, the real gross yield sits <em>above</em> the headline
            rate — by roughly 29 basis points at 91 days, and under one basis point at 364, where
            there is nothing left to reinvest.
          </p>
          <p>
            This page previously used the other convention — a bank discount on face value — and
            was marked verified while it was wrong. It understated the price and so overstated the
            return, by 84 basis points on the 364-day bill. The formula above reproduces all three
            tenors on CBK&apos;s own published results to four decimal places, which is the only
            reason to trust it.
          </p>

          <h2>Tax, and where bills differ from bonds</h2>
          <p>
            Interest on Treasury bills is taxed at <strong>15% withholding</strong>, with no
            equivalent of the infrastructure-bond exemption. A bond and a bill showing the same
            headline rate do not pay the same, and on this page every net figure already has the
            15% taken off.
          </p>

          <h2>How buying works</h2>
          <p>
            Bills are auctioned weekly, with bids closing Thursday at 2:00pm through DhowCSD. The
            minimum is Ksh 100,000, and above that in multiples of Ksh 50,000. The 364-day tenor is
            under notice — the National Treasury has said it intends to phase it out to shorten the
            debt profile — but it is still being auctioned and still being taken, thinly.
          </p>

          <h2>What this page cannot tell you</h2>
          <p>
            These are primary auction figures: what the government paid to borrow, on the day it
            borrowed. They are not traded prices, and we publish no secondary-market prices at all.
            If you need to know what a bill is worth to sell before maturity, this is not that
            number — and neither is any other figure on this site.{' '}
            <Link href="/sources/">See where every figure comes from</Link>.
          </p>
        </>
      }
    >
      <TbillsClient />
    </ToolShell>
  );
}
