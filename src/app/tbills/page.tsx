import type { Metadata } from 'next';
import ToolShell from '@/components/shared/ToolShell';
import TbillsClient from './TbillsClient';

/* No metadata existed here before: a `'use client'` module cannot export it,
 * and this page was one from its first line. */
export const metadata: Metadata = {
  title: 'Treasury bill calculator — 91, 182 and 364 days | Mwangaza Yield',
  description:
    'What a Kenyan Treasury bill actually returns after 15% withholding tax. Compare 91, 182 and 364-day tenors against the latest published CBK auction results.',
};

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
    >
      <TbillsClient />
    </ToolShell>
  );
}
