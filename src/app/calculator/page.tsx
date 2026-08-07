import type { Metadata } from 'next';
import ToolShell from '@/components/shared/ToolShell';
import CalculatorClient from './CalculatorClient';

/* This page had no metadata at all until now, and could not have had any: a
 * `'use client'` module cannot export it. So the tab, the search result and
 * every shared link showed only the site-wide default. */
export const metadata: Metadata = {
  title: 'Bond calculator — what would this bond pay me? | Mwangaza Yield',
  description:
    'Work out what a Kenyan Treasury bond actually pays you after withholding tax — '
    + '0% on infrastructure bonds, 10% at ten years or longer, 15% below that. '
    + 'Uses published CBK auction results.',
};

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
    >
      <CalculatorClient />
    </ToolShell>
  );
}
