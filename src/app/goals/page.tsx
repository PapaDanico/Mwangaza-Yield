import type { Metadata } from 'next';
import ToolShell from '@/components/shared/ToolShell';
import GoalsClient from './GoalsClient';

/* No metadata existed here before: a `'use client'` module cannot export it,
 * and this page was one from its first line. */
export const metadata: Metadata = {
  title: 'Plan by objective — school fees, income, FIRE | Mwangaza Yield',
  description:
    'Start from what the money is for — school fees, passive income, capital preservation '
    + 'or early retirement — and shape a Kenyan Treasury bond plan around it, after tax.',
};

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
    >
      <GoalsClient />
    </ToolShell>
  );
}
