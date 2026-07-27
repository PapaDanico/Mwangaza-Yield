import type { Metadata } from 'next';

/**
 * Metadata lives in a layout because the page is a Client Component.
 *
 * Next.js forbids `export const metadata` from a "use client" module, so these
 * routes had silently inherited the site-wide title from the root layout —
 * every one of them reading "Mwangaza Yield — Government bonds, made plain" in
 * the browser tab, in a bookmark, and to a search engine. It was never an
 * oversight: the nine routes missing a title were exactly the nine that are
 * interactive, which is why they could not carry one themselves.
 */
export const metadata: Metadata = {
  title: 'Bond Price Book — Mwangaza Yield',
  description:
    'Record the prices you are quoted and see the yield each one implies, so a broker\'s number can be checked before you act on it.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
