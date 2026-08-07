import type { Metadata } from 'next';
import { Tag } from 'lucide-react';
import ToolShell from '@/components/shared/ToolShell';
import PricesClient from './PricesClient';

/* No metadata existed here before: a `'use client'` module cannot export it,
 * and this page was one from its first line. */
export const metadata: Metadata = {
  title: 'Your bond price book | Mwangaza Yield',
  description:
    'Every yield here is a function of what you paid. Record the price you were quoted or paid for each Kenyan Treasury bond — stored only on your device, never transmitted.',
};

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
    >
      <PricesClient />
    </ToolShell>
  );
}
