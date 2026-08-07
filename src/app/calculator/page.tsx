import Link from 'next/link';
import ToolShell from '@/components/shared/ToolShell';
import CalculatorClient from './CalculatorClient';

export default function CalculatorPage() {
  return (
    <ToolShell
      title="What would this bond pay me?"
      intro={
        <>
          Pick a bond, say how much you would put in, and see what actually reaches you once
          Kenyan tax is taken off. Infrastructure bonds pay their coupon whole; everything else
          loses 10% or 15% to withholding tax, which is often what separates two bonds whose
          headline rates look alike.
        </>
      }
      after={
        <>
          <h2>The three tax bands, and why they decide more than the coupon</h2>
          <p>
            Kenyan withholding tax on government bond interest is not one rate. Infrastructure
            bonds pay their coupon <strong>whole</strong> — no withholding at all. Other bonds with
            an original tenor of <strong>ten years or more</strong> are withheld at 10%. Anything
            shorter is withheld at 15%.
          </p>
          <p>
            That spread does more work than most coupon differences. A tax-free infrastructure bond
            at 13% leaves you 13%; a 14% bond withheld at 15% leaves you 11.9%. The bond with the
            higher headline pays you less, which is the single most common way a comparison made on
            coupon alone goes wrong.
          </p>

          <h2>Yield depends on what you paid, not on the coupon</h2>
          <p>
            A coupon is a percentage of face value. Your yield is a percentage of what you actually
            handed over. Where this app holds no price for a bond it uses{' '}
            <strong>100 as a placeholder</strong> — par — and that is a stand-in, not a market
            quote. Record what you paid or were quoted in{' '}
            <Link href="/prices/">your price book</Link> and every figure here recomputes against
            it.
          </p>

          <h2>What this page cannot tell you</h2>
          <p>
            We publish <strong>no secondary-market prices</strong>. Nothing here is a valuation,
            and nothing here says what a bond is worth to sell today. The figures are what a bond
            pays if you hold it, given a price you supply. Auction results tell you what other
            bidders accepted on the day — a useful comparison, and still not a price.{' '}
            <Link href="/sources/">See where every figure comes from</Link>.
          </p>
          <p>
            Nor is any of it advice. It is arithmetic on figures you can check, which is why the
            workings are shown rather than only the answer.
          </p>
        </>
      }
    >
      <CalculatorClient />
    </ToolShell>
  );
}
