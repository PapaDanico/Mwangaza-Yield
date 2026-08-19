import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offline Mode — Mwangaza Yield',
  description: 'What remains available when you are offline.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
