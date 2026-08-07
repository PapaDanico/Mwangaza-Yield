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
    >
      <GoalsClient />
    </ToolShell>
  );
}
