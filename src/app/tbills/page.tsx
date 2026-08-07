import ToolShell from '@/components/shared/ToolShell';
import TbillsClient from './TbillsClient';

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
