import Link from 'next/link';
import { ArrowRightLeft } from 'lucide-react';
import ToolShell from '@/components/shared/ToolShell';
import SellClient from './SellClient';

export default function Page() {
  return (
    <ToolShell
      title={<><ArrowRightLeft size={22} className="text-gold-600" /> Should you sell?</>}
      intro={
        <>
          A broker&apos;s pricing sheet tells you what the transaction is. It does not tell you
          whether to do it. Type the figures from your quote and we will check them, and show
          what you would be giving up by selling early.
        </>
      }
      after={
        <>
          <h2>Why you type the price in, rather than reading it here</h2>
          <p>
            We hold no secondary-market prices and publish none. That is a deliberate limit, not a
            gap waiting to be filled: the Exchange&apos;s data is proprietary and its terms forbid
            using it to build a product, so this app does not carry it in any form. The price on
            your broker&apos;s sheet or DhowCSD quote is the real one, and it is the one this page
            works from.
          </p>
          <p>
            What we can do is check it. A quote has parts — clean price, accrued interest,
            settlement — and the arithmetic between them either holds or does not.
          </p>

          <h2>What selling early actually costs</h2>
          <p>
            A bond bought to hold has a return you already know. Selling replaces that known stream
            with cash now, and the difference is not the gain or loss on the price alone: it is the
            coupons you no longer receive, less what you can earn on the proceeds instead. A quote
            that looks like a profit against what you paid can still leave you worse off than
            holding, and that comparison is what this page puts in front of you.
          </p>

          <h2>Tax follows the bond, not the sale</h2>
          <p>
            Withholding on coupon interest depends on the bond: nothing on infrastructure bonds,
            10% at an original tenor of ten years or more, 15% below. Selling does not change the
            treatment of interest you have already received.
          </p>

          <h2>What this page cannot tell you</h2>
          <p>
            Whether the quote you were given is a <em>good</em> one against the wider market. That
            needs traded prices across dealers, which we do not have and will not publish. This
            checks the arithmetic of the quote in front of you and shows what you give up by
            taking it — a narrower question, answered honestly.{' '}
            <Link href="/sources/">See where every figure comes from</Link>.
          </p>
        </>
      }
    >
      <SellClient />
    </ToolShell>
  );
}
