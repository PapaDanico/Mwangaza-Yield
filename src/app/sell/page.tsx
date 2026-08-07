import { ArrowRightLeft } from 'lucide-react';
import ToolShell from '@/components/shared/ToolShell';
import SellClient from './SellClient';

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
