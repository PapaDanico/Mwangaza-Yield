import type { ReactNode } from 'react';

/**
 * The static half of a tool page, rendered on the SERVER.
 *
 * WHY THIS EXISTS
 *
 * Five tool pages — calculator, tbills, sell, prices, goals — were `'use
 * client'` from their first line, so `next build` emitted a `<main>` with
 * literally zero characters in it. Measured on 2026-08-07:
 *
 *     0 chars   /calculator/  /goals/  /prices/  /sell/  /tbills/
 *
 * Everything a reader sees on those pages arrives only after JavaScript runs.
 * An external review read that as the pages being broken. They are not — they
 * work perfectly in a browser — but a crawler, a link preview, a reader on a
 * failing connection, and anything that reads HTML without executing it all
 * get a blank panel.
 *
 * That matters more here than it would elsewhere. These are the pages somebody
 * finds by searching "Kenya treasury bill calculator", and they were the five
 * with nothing to find.
 *
 * A NOTE ON METADATA, AND A CORRECTION
 *
 * The first version of this file claimed these pages had no `<title>` and no
 * description. That was wrong. They had both, supplied by a per-route
 * `layout.tsx` whose own docstring explains the reason: Next.js forbids
 * `export const metadata` from a `'use client'` module, so the metadata was
 * deliberately moved one level up. The mechanism had already been found and
 * solved; only the server-rendered TEXT was missing.
 *
 * Because that was misread, this change briefly added a second `metadata`
 * export in each page.tsx. Page metadata overrides layout metadata, so five
 * curated titles were silently replaced by worse ones that also broke the
 * site's em-dash separator convention. Those exports have been removed and
 * `layout.tsx` is again the single source. `tool-metadata.test.ts` now fails
 * if a route grows a second one.
 *
 * WHAT IT CHANGES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * The heading and the explanatory paragraph move out of the client component
 * and into a server one. They were always static; nothing about them needed a
 * browser. The interactive part — the inputs, the arithmetic, the store
 * subscriptions — stays exactly where it was, as a client island below.
 *
 * This is not a rewrite of the tools, and is deliberately not one. The
 * calculations are the part of this codebase most expensive to get wrong, and
 * moving them to gain SEO text would be trading a real risk for a marketing
 * one.
 */
export default function ToolShell({
  title,
  intro,
  children,
}: {
  /** ReactNode rather than string: two of these headings carry a lucide icon. */
  title: ReactNode;
  /** One or two sentences of plain prose. Rendered server-side, so it is what
   *  a crawler and a link preview actually receive. */
  intro: ReactNode;
  /** The interactive island. */
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-1 max-w-[64ch] text-sm leading-relaxed text-ink-muted">{intro}</p>
      </div>
      {children}
    </div>
  );
}
