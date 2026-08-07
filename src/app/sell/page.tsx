import type { Metadata } from 'next';
import { ArrowRightLeft } from 'lucide-react';
import ToolShell from '@/components/shared/ToolShell';
import SellClient from './SellClient';

/* No metadata existed here before: a `'use client'` module cannot export it,
 * and this page was one from its first line. */
export const metadata: Metadata = {
  title: 'Should you sell this bond? | Mwangaza Yield',
  description:
    "A broker's quote tells you what the transaction is, not whether to do it. "
    + 'Check the price, the accrued interest and what you would give up by selling early.',
};

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
    >
      <SellClient />
    </ToolShell>
  );
}
