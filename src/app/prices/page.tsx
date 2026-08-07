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
    >
      <PricesClient />
    </ToolShell>
  );
}
