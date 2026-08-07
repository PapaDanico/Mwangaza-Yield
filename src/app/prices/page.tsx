import Link from 'next/link';
import { Tag } from 'lucide-react';
import ToolShell from '@/components/shared/ToolShell';
import PricesClient from './PricesClient';

export default function Page() {
  return (
    <ToolShell
      title={<><Tag size={22} className="text-gold-600" /> Your price book</>}
      intro={
        <>
          Every yield in this app is a function of what you pay. Where we hold no price we use
          100, which is a placeholder rather than the market. Record what you actually paid, or
          what a broker or DhowCSD quoted — it stays on this device and is never sent anywhere.
        </>
      }
      after={
        <>
          <h2>Why this app asks you for prices instead of fetching them</h2>
          <p>
            Bond prices in Kenya are the Exchange&apos;s data. Its terms make them proprietary and
            forbid using them to build a product, and being a small, well-meaning user is not a
            licence. So the dependency was removed rather than managed: this app fetches no market
            prices, from anyone, and publishes none.
          </p>
          <p>
            What is left is the price <em>you</em> were given — what you paid, or what a broker or
            DhowCSD quoted you. That is yours to record, and it is the honest input for every yield
            this site shows you.
          </p>

          <h2>What 100 means when you see it</h2>
          <p>
            Where no price is recorded, calculations use <strong>100</strong> — par. It is a
            placeholder chosen so the arithmetic can proceed, not an estimate of what a bond is
            worth. A yield computed against 100 answers &ldquo;what would this pay if bought at
            par&rdquo;, which is a real question and a different one from &ldquo;what would this
            pay me&rdquo;. Recording a price replaces the assumption with a fact.
          </p>

          <h2>Where what you type goes</h2>
          <p>
            Nowhere. Prices are stored in your browser&apos;s local database alongside your
            holdings, and are never uploaded. There is no account, no sync and no server copy — we
            could not recover them for you, because we never receive them.{' '}
            <Link href="/privacy/">Read the privacy notice</Link>, which sets out the one thing
            this app used to store on a server and no longer does.
          </p>
        </>
      }
    >
      <PricesClient />
    </ToolShell>
  );
}
