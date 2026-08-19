import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Economic Context Dashboard — Mwangaza Yield',
  description: 'Monetary policy, fiscal health, global spillovers, and market context for Kenyan bond investors.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
