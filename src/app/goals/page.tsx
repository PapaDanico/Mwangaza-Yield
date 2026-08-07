import Link from 'next/link';
import ToolShell from '@/components/shared/ToolShell';
import GoalsClient from './GoalsClient';

export default function GoalsPage() {
  return (
    <ToolShell
      title="Plan by objective"
      intro={
        <>
          Start from what the money is for and we will shape the bonds around it — school fees
          falling due in a particular year, an income you need every month, capital you cannot
          afford to lose, or a retirement date. Every figure is after Kenyan withholding tax.
        </>
      }
      after={
        <>
          <h2>Why starting from the goal changes the answer</h2>
          <p>
            Picking the highest yield and picking the right bond are different problems. Money
            needed in a particular year wants a bond that matures near it, because selling early
            means taking whatever price you are quoted on the day — and this app publishes no
            secondary prices precisely because that price is not knowable in advance. Money you
            want as income wants coupons that land through the year, which is a question about
            payment dates rather than about rates.
          </p>
          <p>
            Those constraints usually cost a little yield. The trade is deliberate: a plan that
            forces you to sell at the wrong moment is worse than one that pays slightly less and
            does not.
          </p>

          <h2>Every figure here is after tax</h2>
          <p>
            Withholding is applied before anything is compared: nothing on infrastructure bonds,
            10% at an original tenor of ten years or more, 15% below. Comparing gross coupons would
            rank the options wrongly, and the ranking is the whole output of this page.
          </p>

          <h2>What this page cannot tell you</h2>
          <p>
            Whether the goal itself is the right one. It takes your dates and amounts as given and
            shapes bonds around them; it does not judge whether the target is affordable or the
            horizon sensible. It also assumes you hold to maturity, because that is the only path
            whose return can be worked out in advance from public figures.{' '}
            <Link href="/sources/">See where every figure comes from</Link>.
          </p>
        </>
      }
    >
      <GoalsClient />
    </ToolShell>
  );
}
