import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '_debug/pwa — Mwangaza Yield',
  description: 'PWA diagnostics for service worker, cache, and IndexedDB status.',
};

export default function DebugPwaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
