import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Receipts — Mwangaza Yield',
  description: 'View and manage locally stored calculation receipts.',
};

export default function ReceiptsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
