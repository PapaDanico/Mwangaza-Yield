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
    >
      <CalculatorClient />
    </ToolShell>
  );
}
